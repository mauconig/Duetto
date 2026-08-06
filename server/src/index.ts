import express from 'express'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, generateCode, normalizeCode, sembrarIdeas, UPLOADS_DIR } from './db.ts'
import { emitirCookie, requireAuth, requireCookie, type AuthedRequest } from './auth.ts'

const PORT = Number(process.env.PORT ?? 8790)
const MAX_MIEMBROS = 2
const MAX_FOTOS = 30
// Past ~30 slices the wheel labels stop being readable.
const MAX_IDEAS = 30
const MAX_LARGO_IDEA = 60

// `files` counts every file part in the request, not photos, and each photo
// is sent twice — full size and thumbnail. Leaving it at MAX_FOTOS silently
// capped uploads at six photos: the seventh made thirteen parts, busboy cut
// the request off and multer raised LIMIT_FILE_COUNT.
//
// Photos arrive already downscaled to ~2500px WebP, which lands well under
// 2MB, so the per-file ceiling is generous rather than expected. It matters
// because memoryStorage buffers the whole request in RAM: the cap times
// MAX_FOTOS * 2 is what a single request can cost this box.
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_FOTOS * 2 },
})

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const q = {
  memberByUser: db.prepare('SELECT * FROM members WHERE user_id = ?'),
  coupleById: db.prepare('SELECT * FROM couples WHERE id = ?'),
  coupleByCode: db.prepare('SELECT * FROM couples WHERE code = ?'),
  membersOfCouple: db.prepare('SELECT user_id, nombre FROM members WHERE couple_id = ? ORDER BY joined_at'),
  insertCouple: db.prepare('INSERT INTO couples (id, code, created_at) VALUES (?, ?, ?)'),
  insertMember: db.prepare('INSERT INTO members (user_id, couple_id, nombre, joined_at) VALUES (?, ?, ?, ?)'),
  updateNombre: db.prepare('UPDATE members SET nombre = ? WHERE user_id = ?'),
  updatePerfil: db.prepare('UPDATE couples SET fecha_aniversario = ?, proximo_hito = ? WHERE id = ?'),
  deleteMember: db.prepare('DELETE FROM members WHERE user_id = ?'),
  deleteCouple: db.prepare('DELETE FROM couples WHERE id = ?'),

  entriesOfCouple: db.prepare('SELECT * FROM entries WHERE couple_id = ? ORDER BY fecha, created_at'),
  entryById: db.prepare('SELECT * FROM entries WHERE id = ? AND couple_id = ?'),
  insertEntry: db.prepare(
    'INSERT INTO entries (id, couple_id, fecha, fecha_fin, nota, fondo, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  updateEntry: db.prepare('UPDATE entries SET fecha = ?, fecha_fin = ?, nota = ? WHERE id = ?'),
  deleteEntry: db.prepare('DELETE FROM entries WHERE id = ?'),
  photosOfEntry: db.prepare('SELECT id, archivo, archivo_min, posicion FROM photos WHERE entry_id = ? ORDER BY posicion'),
  photosOfCouple: db.prepare(
    'SELECT p.id, p.entry_id, p.posicion FROM photos p JOIN entries e ON e.id = p.entry_id WHERE e.couple_id = ? ORDER BY p.posicion',
  ),
  insertPhoto: db.prepare(
    'INSERT INTO photos (id, entry_id, posicion, archivo, archivo_min, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ),
  updatePhotoPos: db.prepare('UPDATE photos SET posicion = ? WHERE id = ?'),
  deletePhoto: db.prepare('DELETE FROM photos WHERE id = ?'),
  /** Joined against entries so a photo id from one couple can never be read
   * or deleted by another. */
  photoForCouple: db.prepare(
    'SELECT p.archivo, p.archivo_min FROM photos p JOIN entries e ON e.id = p.entry_id WHERE p.id = ? AND e.couple_id = ?',
  ),
  /** Every file the couple owns, for cleaning up after the last member leaves. */
  photoFilesOfCouple: db.prepare(
    'SELECT p.archivo, p.archivo_min FROM photos p JOIN entries e ON e.id = p.entry_id WHERE e.couple_id = ?',
  ),

  insertStaged: db.prepare(
    'INSERT INTO staged_photos (id, couple_id, archivo, archivo_min, created_at) VALUES (?, ?, ?, ?, ?)',
  ),
  /** Scoped to the couple, so an id from the other couple resolves to
   * nothing rather than handing over their photo. */
  stagedForCouple: db.prepare('SELECT archivo, archivo_min FROM staged_photos WHERE id = ? AND couple_id = ?'),
  deleteStaged: db.prepare('DELETE FROM staged_photos WHERE id = ?'),
  countStaged: db.prepare('SELECT COUNT(*) AS n FROM staged_photos WHERE couple_id = ?'),
  stagedFilesOfCouple: db.prepare('SELECT archivo, archivo_min FROM staged_photos WHERE couple_id = ?'),
  stagedVencidas: db.prepare('SELECT id, archivo, archivo_min FROM staged_photos WHERE couple_id = ? AND created_at < ?'),

  ideasOfCouple: db.prepare('SELECT id, texto FROM ideas WHERE couple_id = ? ORDER BY posicion, created_at'),
  countIdeas: db.prepare('SELECT COUNT(*) AS n FROM ideas WHERE couple_id = ?'),
  maxPosIdea: db.prepare('SELECT MAX(posicion) AS maxpos FROM ideas WHERE couple_id = ?'),
  insertIdea: db.prepare('INSERT INTO ideas (id, couple_id, texto, posicion, created_at) VALUES (?, ?, ?, ?, ?)'),
  deleteIdea: db.prepare('DELETE FROM ideas WHERE id = ? AND couple_id = ?'),
}

const HITOS = ['cumplemes', 'aniversario']

/** Shape returned to the client for "my couple" in every endpoint, so the
 * frontend always gets the same object back. */
function estadoPareja(coupleId: string, userId: string) {
  const couple = q.coupleById.get(coupleId) as {
    id: string
    code: string
    fecha_aniversario: string | null
    proximo_hito: string | null
  }
  const miembros = q.membersOfCouple.all(coupleId) as { user_id: string; nombre: string }[]
  const yo = miembros.find((m) => m.user_id === userId)
  const pareja = miembros.find((m) => m.user_id !== userId)
  return {
    coupleId: couple.id,
    codigo: couple.code,
    nombrePropio: yo?.nombre ?? null,
    nombrePareja: pareja?.nombre ?? null,
    fechaAniversario: couple.fecha_aniversario,
    proximoHito: couple.proximo_hito,
    vinculada: miembros.length >= MAX_MIEMBROS,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

/** Current user's couple, or 404 if they haven't created/joined one. */
app.get('/api/couple', requireAuth, (req: AuthedRequest, res) => {
  const member = q.memberByUser.get(req.userId!) as { couple_id: string } | undefined
  if (!member) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  res.json(estadoPareja(member.couple_id, req.userId!))
})

/** Create a couple and get a code to share. Returns the existing one if
 * the user already has a couple, so a retry can't strand them in a second. */
app.post('/api/couple', requireAuth, (req: AuthedRequest, res) => {
  const nombre = String(req.body?.nombre ?? '').trim()
  if (!nombre) {
    res.status(400).json({ error: 'Falta tu nombre' })
    return
  }

  const existente = q.memberByUser.get(req.userId!) as { couple_id: string } | undefined
  if (existente) {
    q.updateNombre.run(nombre, req.userId!)
    res.json(estadoPareja(existente.couple_id, req.userId!))
    return
  }

  const id = randomUUID()
  const code = generateCode()
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.insertCouple.run(id, code, ahora)
    q.insertMember.run(req.userId!, id, nombre, ahora)
    sembrarIdeas(id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  res.status(201).json(estadoPareja(id, req.userId!))
})

/** Join an existing couple with the code the other partner shared. */
app.post('/api/couple/join', requireAuth, (req: AuthedRequest, res) => {
  const nombre = String(req.body?.nombre ?? '').trim()
  const codigo = normalizeCode(String(req.body?.codigo ?? ''))
  if (!nombre) {
    res.status(400).json({ error: 'Falta tu nombre' })
    return
  }
  if (!codigo) {
    res.status(400).json({ error: 'Falta el código' })
    return
  }

  const yaEnPareja = q.memberByUser.get(req.userId!) as { couple_id: string } | undefined
  if (yaEnPareja) {
    res.status(409).json({ error: 'Ya estás en una pareja' })
    return
  }

  const couple = q.coupleByCode.get(codigo) as { id: string } | undefined
  if (!couple) {
    res.status(404).json({ error: 'Ese código no existe' })
    return
  }

  const miembros = q.membersOfCouple.all(couple.id) as unknown[]
  if (miembros.length >= MAX_MIEMBROS) {
    res.status(409).json({ error: 'Esa pareja ya está completa' })
    return
  }

  q.insertMember.run(req.userId!, couple.id, nombre, new Date().toISOString())
  res.json(estadoPareja(couple.id, req.userId!))
})

/** Sets the couple's anniversary/milestone and the caller's own name.
 * Every field is optional so the settings screen can change one thing at a
 * time, while onboarding sends them together. `nombre` only ever touches
 * the caller's own row — you can't rename your partner. */
app.patch('/api/couple', requireAuth, (req: AuthedRequest, res) => {
  const member = q.memberByUser.get(req.userId!) as { couple_id: string } | undefined
  if (!member) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }

  const actual = q.coupleById.get(member.couple_id) as {
    fecha_aniversario: string | null
    proximo_hito: string | null
  }

  const traeFecha = req.body?.fechaAniversario !== undefined
  const traeHito = req.body?.proximoHito !== undefined
  const traeNombre = req.body?.nombre !== undefined
  if (!traeFecha && !traeHito && !traeNombre) {
    res.status(400).json({ error: 'No hay nada que cambiar' })
    return
  }

  const fecha = traeFecha ? String(req.body.fechaAniversario).trim() : actual.fecha_aniversario
  const hito = traeHito ? String(req.body.proximoHito).trim() : actual.proximo_hito
  const nombre = traeNombre ? String(req.body.nombre).trim() : null

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'Fecha inválida' })
    return
  }
  if (!hito || !HITOS.includes(hito)) {
    res.status(400).json({ error: 'Hito inválido' })
    return
  }
  if (traeNombre && !nombre) {
    res.status(400).json({ error: 'El nombre no puede quedar vacío' })
    return
  }

  q.updatePerfil.run(fecha, hito, member.couple_id)
  if (nombre) q.updateNombre.run(nombre, req.userId!)
  res.json(estadoPareja(member.couple_id, req.userId!))
})

/** Leaves the couple — the way out of joining with the wrong code.
 *
 * If the other partner is still there they keep everything: the memories
 * belong to the couple, not to whoever uploaded them. The leaver can rejoin
 * later with the same code, since the couple is back down to one member.
 * If nobody is left the couple has no reason to exist, so it goes with its
 * entries, photos and ideas. */
app.delete('/api/couple/me', requireAuth, async (req: AuthedRequest, res) => {
  const member = q.memberByUser.get(req.userId!) as { couple_id: string } | undefined
  if (!member) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }

  const otros = (q.membersOfCouple.all(member.couple_id) as { user_id: string }[]).filter(
    (m) => m.user_id !== req.userId,
  )
  if (otros.length > 0) {
    q.deleteMember.run(req.userId!)
    res.json({ ok: true, parejaBorrada: false })
    return
  }

  // Staged photos included: they belong to nobody once the couple is gone,
  // and nothing else would ever come looking for them.
  const archivos = [
    ...(q.photoFilesOfCouple.all(member.couple_id) as { archivo: string; archivo_min: string | null }[]),
    ...(q.stagedFilesOfCouple.all(member.couple_id) as { archivo: string; archivo_min: string | null }[]),
  ]
  // ON DELETE CASCADE takes members, entries, photos, staging and ideas.
  q.deleteCouple.run(member.couple_id)
  // Files go last: a failure here leaves orphans on disk rather than rows
  // pointing at photos that no longer exist.
  await borrarArchivos(archivos.flatMap(nombresDe))
  res.json({ ok: true, parejaBorrada: true })
})

/** Exchanges a verified Clerk token for the session cookie that photo
 * requests need, since <img> can't send an Authorization header. */
app.post('/api/session', requireAuth, (req: AuthedRequest, res) => {
  emitirCookie(res, req.userId!)
  res.json({ ok: true })
})

/** The couple the caller belongs to, or null. Every entry/photo route goes
 * through this so ids from the client are always scoped to their couple. */
function coupleIdDe(userId: string): string | null {
  const member = q.memberByUser.get(userId) as { couple_id: string } | undefined
  return member?.couple_id ?? null
}

interface FilaEntry {
  id: string
  fecha: string
  fecha_fin: string | null
  nota: string | null
  fondo: string
}

function entradaConFotos(fila: FilaEntry) {
  const fotos = q.photosOfEntry.all(fila.id) as { id: string }[]
  return {
    id: fila.id,
    fecha: fila.fecha,
    fechaFin: fila.fecha_fin ?? undefined,
    nota: fila.nota ?? undefined,
    fondo: fila.fondo,
    fotoIds: fotos.map((f) => f.id),
  }
}

app.get('/api/entries', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const filas = q.entriesOfCouple.all(coupleId) as FilaEntry[]
  res.json(filas.map(entradaConFotos))
})

function leerCampos(body: Record<string, unknown>) {
  const fecha = String(body.fecha ?? '').trim()
  const fechaFin = String(body.fechaFin ?? '').trim()
  const nota = String(body.nota ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  if (fechaFin && !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) return null
  return { fecha, fechaFin: fechaFin || null, nota: nota || null }
}

interface ParGuardado {
  archivo: string
  min: string | null
}

/** The browser sends each photo twice — full size and an 800px copy — as
 * two parallel arrays, so index n of `miniaturas` belongs to index n of
 * `fotos`. A missing thumbnail is tolerated: the reader falls back to the
 * full file rather than showing a hole. */
async function guardarArchivos(
  files: Express.Multer.File[],
  minis: Express.Multer.File[],
): Promise<ParGuardado[]> {
  const guardados: ParGuardado[] = []
  for (let i = 0; i < files.length; i++) {
    const archivo = `${randomUUID()}.webp`
    await writeFile(join(UPLOADS_DIR, archivo), files[i].buffer)
    let min: string | null = null
    if (minis[i]) {
      min = `${randomUUID()}.webp`
      await writeFile(join(UPLOADS_DIR, min), minis[i].buffer)
    }
    guardados.push({ archivo, min })
  }
  return guardados
}

/** Both names of a stored photo, skipping the thumbnail when there isn't one. */
function nombresDe(p: { archivo: string; archivo_min?: string | null }): string[] {
  return p.archivo_min ? [p.archivo, p.archivo_min] : [p.archivo]
}

function borrarArchivos(nombres: string[]) {
  return Promise.all(nombres.map((n) => unlink(join(UPLOADS_DIR, n)).catch(() => {})))
}

/** Multer field layout shared by create and edit. */
const camposSubida = subida.fields([
  { name: 'fotos', maxCount: MAX_FOTOS },
  { name: 'miniaturas', maxCount: MAX_FOTOS },
])

/** One photo at a time for the staging endpoint, so a stray batch is
 * rejected by multer instead of quietly storing half of it. */
const campoUnaFoto = subida.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'miniatura', maxCount: 1 },
])

/** How long an uploaded photo waits for the recuerdo that will claim it.
 * Long enough that nobody hits it mid-edit, short enough that an abandoned
 * sheet doesn't leave files on disk for good. */
const STAGING_MS = 24 * 60 * 60 * 1000

/** Drops this couple's expired staging, rows and files alike. Runs when a
 * photo is uploaded rather than on a timer: uploading is the only way to
 * create the leftovers in the first place. */
async function barrerStaging(coupleId: string) {
  const limite = new Date(Date.now() - STAGING_MS).toISOString()
  const vencidas = q.stagedVencidas.all(coupleId, limite) as {
    id: string
    archivo: string
    archivo_min: string | null
  }[]
  if (vencidas.length === 0) return
  vencidas.forEach((f) => q.deleteStaged.run(f.id))
  await borrarArchivos(vencidas.flatMap(nombresDe))
}

/** Takes one downscaled photo and holds onto it until a recuerdo claims it.
 * The sheet calls this as each photo finishes downscaling, so by the time
 * the user presses save the bytes are already here and the entry request
 * carries no files at all. */
app.post('/api/photos', requireAuth, campoUnaFoto, async (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }

  const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>
  const foto = files.foto?.[0]
  if (!foto) {
    res.status(400).json({ error: 'Falta la foto' })
    return
  }

  await barrerStaging(coupleId)

  // A sheet that's abandoned over and over shouldn't be able to fill the
  // disk before the sweep catches up.
  const { n } = q.countStaged.get(coupleId) as { n: number }
  if (Number(n) >= MAX_FOTOS) {
    res.status(409).json({ error: `Máximo ${MAX_FOTOS} fotos por recuerdo` })
    return
  }

  const [par] = await guardarArchivos([foto], files.miniatura ?? [])
  const id = randomUUID()
  try {
    q.insertStaged.run(id, coupleId, par.archivo, par.min, new Date().toISOString())
  } catch (e) {
    await borrarArchivos(nombresDe({ archivo: par.archivo, archivo_min: par.min }))
    throw e
  }
  res.status(201).json({ id })
})

const RE_STAGED = /^staged:(.+)$/
const RE_NUEVO = /^nuevo:(\d+)$/

function ordenDe(body: Record<string, unknown> | undefined): string[] {
  const crudo = body?.orden
  return (Array.isArray(crudo) ? crudo : crudo ? [crudo] : []).map(String)
}

/** Looks up the files behind every `staged:<id>` in an order, without
 * touching the rows — the claiming happens inside the transaction. Null
 * when one of them is gone (swept, or another couple's), which the callers
 * turn into a 400: losing a photo silently is worse than failing. */
function leerStaged(orden: string[], coupleId: string): Map<string, ParGuardado> | null {
  const encontradas = new Map<string, ParGuardado>()
  for (const item of orden) {
    const m = RE_STAGED.exec(item)
    if (!m) continue
    const fila = q.stagedForCouple.get(m[1], coupleId) as { archivo: string; archivo_min: string | null } | undefined
    if (!fila) return null
    encontradas.set(m[1], { archivo: fila.archivo, min: fila.archivo_min })
  }
  return encontradas
}

/** Writes the entry's photo rows in the order the user arranged. An item is
 * a photo already staged, a file that came in this request, or — on edit —
 * one of the entry's existing photos, which the caller repositions. */
function colocarFotos(
  entryId: string,
  orden: string[],
  archivos: ParGuardado[],
  staged: Map<string, ParGuardado>,
  ahora: string,
  existente?: (id: string, posicion: number) => void,
) {
  orden.forEach((item, posicion) => {
    const est = RE_STAGED.exec(item)
    if (est) {
      const par = staged.get(est[1])!
      q.insertPhoto.run(randomUUID(), entryId, posicion, par.archivo, par.min, ahora)
      q.deleteStaged.run(est[1])
      return
    }
    const nuevo = RE_NUEVO.exec(item)
    if (nuevo) {
      const par = archivos[Number(nuevo[1])]
      if (par) q.insertPhoto.run(randomUUID(), entryId, posicion, par.archivo, par.min, ahora)
      return
    }
    existente?.(item, posicion)
  })
}

/** Reads both file arrays, refusing a request whose thumbnails don't line up
 * with the photos. guardarArchivos pairs them by index, so a truncated
 * `miniaturas` array would silently store photos with no thumbnail — better
 * to fail loudly than to leave the timeline loading full-size files. Zero
 * thumbnails is allowed: that's a client too old to send them. */
function archivosDe(req: AuthedRequest) {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>
  const fotos = files.fotos ?? []
  const miniaturas = files.miniaturas ?? []
  if (miniaturas.length > 0 && miniaturas.length !== fotos.length) return null
  return { fotos, miniaturas }
}

app.post('/api/entries', requireAuth, camposSubida, async (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const campos = leerCampos(req.body ?? {})
  if (!campos) {
    res.status(400).json({ error: 'Fecha inválida' })
    return
  }
  const fondo = String(req.body?.fondo ?? '').trim()
  if (!fondo) {
    res.status(400).json({ error: 'Falta el fondo' })
    return
  }

  const subidas = archivosDe(req)
  if (!subidas) {
    res.status(400).json({ error: 'Las fotos llegaron incompletas' })
    return
  }
  const orden = ordenDe(req.body)
  const staged = leerStaged(orden, coupleId)
  if (!staged) {
    res.status(400).json({ error: 'Algunas fotos expiraron, volvé a agregarlas' })
    return
  }
  const archivos = await guardarArchivos(subidas.fotos, subidas.miniaturas)
  const id = randomUUID()
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.insertEntry.run(id, coupleId, campos.fecha, campos.fechaFin, campos.nota, fondo, req.userId!, ahora)
    // A client that sent files without an order gets them in upload order.
    if (orden.length === 0) {
      archivos.forEach((par, i) => q.insertPhoto.run(randomUUID(), id, i, par.archivo, par.min, ahora))
    } else {
      colocarFotos(id, orden, archivos, staged, ahora)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    await borrarArchivos(archivos.flatMap((p) => (p.min ? [p.archivo, p.min] : [p.archivo])))
    throw e
  }
  res.status(201).json(entradaConFotos(q.entryById.get(id, coupleId) as FilaEntry))
})

/** Updates fields and rebuilds the photo list. `orden` is the final
 * sequence the user arranged: each item is either an existing photo id or
 * `nuevo:<n>` pointing at the n-th uploaded file, so a newly added photo
 * can sit anywhere — not just at the end. Photos left out are deleted. */
app.patch('/api/entries/:id', requireAuth, camposSubida, async (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const entrada = q.entryById.get(req.params.id, coupleId) as FilaEntry | undefined
  if (!entrada) {
    res.status(404).json({ error: 'No encontramos ese recuerdo' })
    return
  }
  const campos = leerCampos(req.body ?? {})
  if (!campos) {
    res.status(400).json({ error: 'Fecha inválida' })
    return
  }

  const actuales = q.photosOfEntry.all(entrada.id) as { id: string; archivo: string; archivo_min: string | null }[]
  const orden = ordenDe(req.body)
  const conservados = orden.filter((item) => actuales.some((p) => p.id === item))
  const eliminados = actuales.filter((p) => !conservados.includes(p.id))

  const subidas = archivosDe(req)
  if (!subidas) {
    res.status(400).json({ error: 'Las fotos llegaron incompletas' })
    return
  }
  const staged = leerStaged(orden, coupleId)
  if (!staged) {
    res.status(400).json({ error: 'Algunas fotos expiraron, volvé a agregarlas' })
    return
  }
  const archivos = await guardarArchivos(subidas.fotos, subidas.miniaturas)
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.updateEntry.run(campos.fecha, campos.fechaFin, campos.nota, entrada.id)
    eliminados.forEach((p) => q.deletePhoto.run(p.id))
    colocarFotos(entrada.id, orden, archivos, staged, ahora, (item, posicion) => {
      if (conservados.includes(item)) q.updatePhotoPos.run(posicion, item)
    })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    await borrarArchivos(archivos.flatMap((p) => (p.min ? [p.archivo, p.min] : [p.archivo])))
    throw e
  }
  // Only unlink after the transaction committed, so a rollback can't leave
  // rows pointing at files that are already gone.
  await borrarArchivos(eliminados.flatMap(nombresDe))
  res.json(entradaConFotos(q.entryById.get(entrada.id, coupleId) as FilaEntry))
})

app.delete('/api/entries/:id', requireAuth, async (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const entrada = q.entryById.get(req.params.id, coupleId) as FilaEntry | undefined
  if (!entrada) {
    res.status(404).json({ error: 'No encontramos ese recuerdo' })
    return
  }

  const fotos = q.photosOfEntry.all(entrada.id) as { archivo: string; archivo_min: string | null }[]
  // ON DELETE CASCADE clears the photo rows with the entry.
  q.deleteEntry.run(entrada.id)
  // Files go only after the rows are gone, so a failure here leaves
  // orphaned files rather than rows pointing at missing photos.
  await borrarArchivos(fotos.flatMap(nombresDe))
  res.json({ ok: true })
})

app.get('/api/ideas', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  res.json(q.ideasOfCouple.all(coupleId))
})

/** New ideas go to the end of the wheel, so the order both partners see
 * stays the order they were added in. */
app.post('/api/ideas', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const texto = String(req.body?.texto ?? '').trim()
  if (!texto) {
    res.status(400).json({ error: 'Escribí una idea' })
    return
  }
  if (texto.length > MAX_LARGO_IDEA) {
    res.status(400).json({ error: `La idea no puede pasar de ${MAX_LARGO_IDEA} caracteres` })
    return
  }

  const { n } = q.countIdeas.get(coupleId) as { n: number }
  if (Number(n) >= MAX_IDEAS) {
    res.status(409).json({ error: `La ruleta llega hasta ${MAX_IDEAS} ideas` })
    return
  }

  const { maxpos } = q.maxPosIdea.get(coupleId) as { maxpos: number | null }
  const id = randomUUID()
  q.insertIdea.run(id, coupleId, texto, Number(maxpos ?? -1) + 1, new Date().toISOString())
  res.status(201).json({ id, texto })
})

app.delete('/api/ideas/:id', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const { changes } = q.deleteIdea.run(req.params.id, coupleId)
  if (!Number(changes)) {
    res.status(404).json({ error: 'No encontramos esa idea' })
    return
  }
  res.json({ ok: true })
})

/** Photo files. Cookie-authenticated so <img> works, and scoped to the
 * caller's couple so a leaked id is useless to anyone else.
 *
 * `?tamano=min` serves the 800px copy the timeline grid needs. Photos
 * uploaded before thumbnails existed have none, so they fall back to the
 * full file — a slow photo beats a broken one. */
app.get('/api/photos/:id', requireCookie, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  const foto = q.photoForCouple.get(req.params.id, coupleId) as
    | { archivo: string; archivo_min: string | null }
    | undefined
  if (!foto) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  const archivo = req.query.tamano === 'min' && foto.archivo_min ? foto.archivo_min : foto.archivo
  res.setHeader('Content-Type', 'image/webp')
  // Filenames are random and never reused, so the bytes behind an id never
  // change — but keep it private so no shared cache holds onto them.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  createReadStream(join(UPLOADS_DIR, archivo)).on('error', () => res.sendStatus(404)).pipe(res)
})

/** Multer rejects an upload before the route ever runs. Those are the
 * client's fault, not ours, so they get a 400 the user can act on — a bare
 * "Error interno" gives no hint that the fix is sending fewer photos. */
const DEMASIADAS = `No podés subir más de ${MAX_FOTOS} fotos por recuerdo`
const MENSAJES_SUBIDA: Record<string, string> = {
  LIMIT_FILE_COUNT: DEMASIADAS,
  // The only file fields here are fotos, miniaturas and the single foto of
  // the staging route, so an "unexpected" file is really the maxCount on one
  // of them being passed.
  LIMIT_UNEXPECTED_FILE: DEMASIADAS,
  LIMIT_FILE_SIZE: 'Alguna de las fotos es demasiado pesada',
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.warn(`subida rechazada: ${err.code}`)
    res.status(400).json({ error: MENSAJES_SUBIDA[err.code] ?? 'No pudimos procesar las fotos' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`duette-server escuchando en 127.0.0.1:${PORT}`)
})
