import { createHash } from 'node:crypto'
import { open, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { AwsClient } from 'aws4fetch'
import { UPLOADS_DIR } from './db.ts'

/** Where photo bytes live. The routes hand over a name and never learn
 * whether it landed on a disk or in a bucket.
 *
 * A name is what `photos.archivo` and friends already store: a bare
 * `<uuid>.webp`, never a path and never a URL. That's what makes the two
 * implementations interchangeable, and what keeps the provider out of the
 * database — see plan.md. */
export interface Almacen {
  guardar(nombre: string, bytes: Buffer): Promise<void>
  /** Null means the object isn't there, which callers turn into a 404.
   * Anything else — an unreadable disk, R2 refusing — throws. */
  leer(nombre: string): Promise<Readable | null>
  borrar(nombres: string[]): Promise<void>
}

/** Deleting is best-effort on purpose: a recuerdo the user removed is gone
 * from the timeline whether or not the bytes went with it, and failing the
 * request would be worse. What isn't fine is doing it in silence — that's
 * how orphans pile up unnoticed, and on R2 an orphan is billed every
 * month. */
function avisarBorrado(nombre: string, e: unknown) {
  if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return
  console.error(`no se pudo borrar ${nombre}:`, e)
}

export const almacenDisco: Almacen = {
  async guardar(nombre, bytes) {
    await writeFile(join(UPLOADS_DIR, nombre), bytes)
  },

  async leer(nombre) {
    // Opening first and streaming off the handle keeps "missing" apart from
    // "broken": createReadStream reports both as an error event, which
    // arrives long after the response headers would already be out.
    let fh
    try {
      fh = await open(join(UPLOADS_DIR, nombre), 'r')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
    return fh.createReadStream({ autoClose: true })
  },

  async borrar(nombres) {
    await Promise.all(nombres.map((n) => unlink(join(UPLOADS_DIR, n)).catch((e) => avisarBorrado(n, e))))
  },
}

/** What a single DeleteObjects call accepts. Leaving a couple deletes
 * hundreds of files at once, and a thousand separate requests for that would
 * be a thousand Class A operations. */
const LOTE_BORRADO = 1000

/** Names are `<uuid>.webp` by construction, so this has nothing to do today.
 * It's here so that a name which ever grows an `&` fails visibly instead of
 * building invalid XML that R2 answers with a 400 nobody reads. */
const escaparXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The migration script needs to see into the bucket to check its own work;
 * the running server never does. */
export interface AlmacenR2 extends Almacen {
  existe(nombre: string): Promise<boolean>
  listar(): Promise<string[]>
}

function requerido(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}: el almacenamiento en R2 no arranca sin credenciales`)
  return valor
}

export function crearAlmacenR2(): AlmacenR2 {
  const bucket = `https://${requerido('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${requerido('R2_BUCKET')}`
  const aws = new AwsClient({
    accessKeyId: requerido('R2_ACCESS_KEY_ID'),
    secretAccessKey: requerido('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    // R2 has no regions to pick; SigV4 needs the field filled in regardless.
    region: 'auto',
    // The default is ten, and an upload that retries for a minute is worse
    // than one that fails: the request holds the whole photo in memory the
    // entire time.
    retries: 3,
  })

  const url = (nombre: string) => `${bucket}/${encodeURIComponent(nombre)}`

  async function fallar(r: Response, que: string): Promise<never> {
    throw new Error(`R2 ${que}: ${r.status} ${(await r.text()).slice(0, 300)}`)
  }

  async function borrarLote(nombres: string[]) {
    const cuerpo =
      '<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>' +
      nombres.map((n) => `<Object><Key>${escaparXml(n)}</Key></Object>`).join('') +
      '</Delete>'
    const r = await aws.fetch(`${bucket}?delete`, {
      method: 'POST',
      body: cuerpo,
      headers: {
        'Content-Type': 'application/xml',
        // S3 requires the body checksum on this call and R2 follows suit.
        'Content-MD5': createHash('md5').update(cuerpo).digest('base64'),
      },
    })
    if (!r.ok) {
      console.error(`no se pudo borrar el lote: ${r.status} ${(await r.text()).slice(0, 300)}`)
      return
    }
    // Quiet mode answers with the failures and nothing else, so a body with
    // an Error in it is the only sign that part of the batch didn't go.
    const xml = await r.text()
    if (xml.includes('<Error>')) console.error(`borrado parcial en R2: ${xml.slice(0, 500)}`)
  }

  return {
    async guardar(nombre, bytes) {
      const r = await aws.fetch(url(nombre), {
        method: 'PUT',
        body: bytes,
        headers: { 'Content-Type': 'image/webp' },
      })
      if (!r.ok) await fallar(r, `PUT ${nombre}`)
    },

    async leer(nombre) {
      const r = await aws.fetch(url(nombre))
      if (r.status === 404) return null
      if (!r.ok || !r.body) await fallar(r, `GET ${nombre}`)
      return Readable.fromWeb(r.body!)
    },

    async borrar(nombres) {
      for (let i = 0; i < nombres.length; i += LOTE_BORRADO) {
        await borrarLote(nombres.slice(i, i + LOTE_BORRADO))
      }
    },

    async existe(nombre) {
      const r = await aws.fetch(url(nombre), { method: 'HEAD' })
      if (r.status === 404) return false
      if (!r.ok) await fallar(r, `HEAD ${nombre}`)
      return true
    },

    async listar() {
      const nombres: string[] = []
      let token: string | undefined
      do {
        const params = new URLSearchParams({ 'list-type': '2', 'max-keys': String(LOTE_BORRADO) })
        if (token) params.set('continuation-token', token)
        const r = await aws.fetch(`${bucket}?${params}`)
        if (!r.ok) await fallar(r, 'LIST')
        const xml = await r.text()
        // Keys are `<uuid>.webp`, so no entity ever needs decoding here.
        for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) nombres.push(m[1])
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1]
          : undefined
      } while (token)
      return nombres
    },
  }
}

const MODO = process.env.DUETTE_ALMACEN ?? 'disco'
// A typo like `R2` silently falling back to the disk is the same failure the
// deploy workflow learned the hard way: green run, wrong behaviour, nobody
// notices. Refuse to boot instead.
if (MODO !== 'disco' && MODO !== 'r2') {
  throw new Error(`DUETTE_ALMACEN inválido: ${MODO} (esperaba 'disco' o 'r2')`)
}

/** Picked once at import, so a missing credential is a boot failure and not
 * a 500 on somebody's first upload. */
export const almacen: Almacen = MODO === 'r2' ? crearAlmacenR2() : almacenDisco
