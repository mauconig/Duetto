/** Copies every photo the database knows about from the VPS disk into R2.
 *
 * One-shot, idempotent, and it deletes nothing — not from disk, not from the
 * bucket. Running it twice is a no-op the second time, and running it while
 * the server is still serving from disk is safe.
 *
 * On the VPS, with the R2 credentials in the environment:
 *
 *   set -a; . /etc/duette-api.env; set +a
 *   DUETTE_ALMACEN=disco node src/migrar-a-r2.ts
 *
 * The flag stays on `disco` on purpose: it decides what the *server* reads,
 * and this script talks to both stores directly regardless. Flipping it is
 * step 7, after this comes back clean.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crearAlmacenR2 } from './almacen.ts'
import { db, UPLOADS_DIR } from './db.ts'

/** How many uploads to verify byte-for-byte at the end. Enough to catch a
 * broken pipeline — a truncated body, a wrong content type — without paying
 * to download everything twice. */
const MUESTRA = 10

/** Every filename the database points at, across the three tables that hold
 * photos. `archivo_min` is null on photos uploaded before thumbnails
 * existed, and those rows contribute one name instead of two. */
function nombresEnBase(): Set<string> {
  const nombres = new Set<string>()
  for (const tabla of ['photos', 'staged_photos', 'inspiraciones']) {
    const filas = db.prepare(`SELECT archivo, archivo_min FROM ${tabla}`).all() as {
      archivo: string
      archivo_min: string | null
    }[]
    for (const f of filas) {
      nombres.add(f.archivo)
      if (f.archivo_min) nombres.add(f.archivo_min)
    }
  }
  return nombres
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function bajarDeR2(r2: ReturnType<typeof crearAlmacenR2>, nombre: string): Promise<Buffer | null> {
  const cuerpo = await r2.leer(nombre)
  if (!cuerpo) return null
  const partes: Buffer[] = []
  for await (const parte of cuerpo) partes.push(parte as Buffer)
  return Buffer.concat(partes)
}

async function main() {
  const r2 = crearAlmacenR2()

  const enBase = nombresEnBase()
  const enDisco = new Set(await readdir(UPLOADS_DIR))
  const enBucket = new Set(await r2.listar())
  console.log(`base: ${enBase.size} nombres · disco: ${enDisco.size} archivos · bucket: ${enBucket.size} objetos`)

  const subidos: string[] = []
  const sinArchivo: string[] = []
  let yaEstaban = 0

  for (const nombre of enBase) {
    if (enBucket.has(nombre)) {
      yaEstaban++
      continue
    }
    if (!enDisco.has(nombre)) {
      sinArchivo.push(nombre)
      continue
    }
    await r2.guardar(nombre, await readFile(join(UPLOADS_DIR, nombre)))
    subidos.push(nombre)
    if (subidos.length % 25 === 0) console.log(`  subidos ${subidos.length}…`)
  }

  console.log(`\nsubidos ahora: ${subidos.length} · ya estaban: ${yaEstaban}`)

  // Both directions, because they mean different things. A row without a
  // file is data already lost and the migration can't invent it; a file
  // without a row is dead weight that would be paid for every month.
  const huerfanosEnDisco = [...enDisco].filter((n) => !enBase.has(n))
  if (sinArchivo.length > 0) {
    console.warn(`\n⚠ ${sinArchivo.length} filas apuntan a archivos que no están en el disco:`)
    for (const n of sinArchivo.slice(0, 20)) console.warn(`   ${n}`)
    if (sinArchivo.length > 20) console.warn(`   …y ${sinArchivo.length - 20} más`)
  }
  if (huerfanosEnDisco.length > 0) {
    console.warn(`\n⚠ ${huerfanosEnDisco.length} archivos en el disco sin fila en la base (no se subieron)`)
  }

  // The count that matters: everything the database points at has to exist
  // in the bucket now. `sinArchivo` is subtracted because those bytes never
  // existed to begin with — the check is about what the migration could
  // actually move.
  const despues = new Set(await r2.listar())
  const faltantes = [...enBase].filter((n) => !despues.has(n))
  const inesperados = faltantes.filter((n) => !sinArchivo.includes(n))

  console.log(`\nbucket ahora: ${despues.size} objetos`)
  if (inesperados.length > 0) {
    console.error(`\n✗ ${inesperados.length} nombres de la base siguen sin estar en el bucket:`)
    for (const n of inesperados.slice(0, 20)) console.error(`   ${n}`)
    process.exitCode = 1
    return
  }

  // Downloading a sample back and comparing hashes is the only check that
  // proves the bytes survived the trip, rather than that a request came back
  // with a 200.
  const candidatos = [...enBase].filter((n) => enDisco.has(n))
  const muestra = candidatos.sort(() => Math.random() - 0.5).slice(0, MUESTRA)
  console.log(`\nverificando ${muestra.length} archivos por hash…`)
  let malos = 0
  for (const nombre of muestra) {
    const local = await readFile(join(UPLOADS_DIR, nombre))
    const remoto = await bajarDeR2(r2, nombre)
    if (!remoto) {
      console.error(`   ✗ ${nombre}: no está en el bucket`)
      malos++
      continue
    }
    if (sha256(local) !== sha256(remoto)) {
      console.error(`   ✗ ${nombre}: hash distinto (${local.length} bytes locales vs ${remoto.length} remotos)`)
      malos++
    }
  }

  if (malos > 0) {
    console.error(`\n✗ ${malos} de ${muestra.length} no coinciden. No cambies DUETTE_ALMACEN todavía.`)
    process.exitCode = 1
    return
  }

  console.log(`\n✓ ${muestra.length}/${muestra.length} verificados. El bucket tiene todo lo que la base referencia.`)
  console.log('  Los archivos locales siguen donde estaban: volver atrás es DUETTE_ALMACEN=disco.')
}

await main()
