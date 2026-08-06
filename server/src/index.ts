import express from 'express'
import cookieParser from 'cookie-parser'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db, generateCode, normalizeCode, UPLOADS_DIR } from './db.ts'
import { emitirCookie, requireAuth, requireCookie, type AuthedRequest } from './auth.ts'

const PORT = Number(process.env.PORT ?? 8790)
const MAX_MIEMBROS = 2
const MAX_FOTOS = 12

// Photos arrive already downscaled to ~2500px WebP by the browser, so this
// is a generous ceiling rather than an expected size.
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_FOTOS },
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

  entriesOfCouple: db.prepare('SELECT * FROM entries WHERE couple_id = ? ORDER BY fecha, created_at'),
  entryById: db.prepare('SELECT * FROM entries WHERE id = ? AND couple_id = ?'),
  insertEntry: db.prepare(
    'INSERT INTO entries (id, couple_id, fecha, fecha_fin, nota, fondo, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  updateEntry: db.prepare('UPDATE entries SET fecha = ?, fecha_fin = ?, nota = ? WHERE id = ?'),
  photosOfEntry: db.prepare('SELECT id, archivo, posicion FROM photos WHERE entry_id = ? ORDER BY posicion'),
  photosOfCouple: db.prepare(
    'SELECT p.id, p.entry_id, p.posicion FROM photos p JOIN entries e ON e.id = p.entry_id WHERE e.couple_id = ? ORDER BY p.posicion',
  ),
  insertPhoto: db.prepare('INSERT INTO photos (id, entry_id, posicion, archivo, created_at) VALUES (?, ?, ?, ?, ?)'),
  updatePhotoPos: db.prepare('UPDATE photos SET posicion = ? WHERE id = ?'),
  deletePhoto: db.prepare('DELETE FROM photos WHERE id = ?'),
  /** Joined against entries so a photo id from one couple can never be read
   * or deleted by another. */
  photoForCouple: db.prepare(
    'SELECT p.archivo FROM photos p JOIN entries e ON e.id = p.entry_id WHERE p.id = ? AND e.couple_id = ?',
  ),
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

/** Set the couple's anniversary and which milestone to track. Shared by
 * both members, so whoever joins second doesn't get asked again. */
app.patch('/api/couple', requireAuth, (req: AuthedRequest, res) => {
  const member = q.memberByUser.get(req.userId!) as { couple_id: string } | undefined
  if (!member) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }

  const fecha = String(req.body?.fechaAniversario ?? '').trim()
  const hito = String(req.body?.proximoHito ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'Fecha inválida' })
    return
  }
  if (!HITOS.includes(hito)) {
    res.status(400).json({ error: 'Hito inválido' })
    return
  }

  q.updatePerfil.run(fecha, hito, member.couple_id)
  res.json(estadoPareja(member.couple_id, req.userId!))
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

async function guardarArchivos(files: Express.Multer.File[]): Promise<string[]> {
  const nombres: string[] = []
  for (const file of files) {
    const nombre = `${randomUUID()}.webp`
    await writeFile(join(UPLOADS_DIR, nombre), file.buffer)
    nombres.push(nombre)
  }
  return nombres
}

app.post('/api/entries', requireAuth, subida.array('fotos', MAX_FOTOS), async (req: AuthedRequest, res) => {
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

  const archivos = await guardarArchivos((req.files as Express.Multer.File[]) ?? [])
  const id = randomUUID()
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.insertEntry.run(id, coupleId, campos.fecha, campos.fechaFin, campos.nota, fondo, req.userId!, ahora)
    archivos.forEach((archivo, i) => q.insertPhoto.run(randomUUID(), id, i, archivo, ahora))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    await Promise.all(archivos.map((a) => unlink(join(UPLOADS_DIR, a)).catch(() => {})))
    throw e
  }
  res.status(201).json(entradaConFotos(q.entryById.get(id, coupleId) as FilaEntry))
})

/** Updates fields and rebuilds the photo list. `orden` is the final
 * sequence the user arranged: each item is either an existing photo id or
 * `nuevo:<n>` pointing at the n-th uploaded file, so a newly added photo
 * can sit anywhere — not just at the end. Photos left out are deleted. */
app.patch('/api/entries/:id', requireAuth, subida.array('fotos', MAX_FOTOS), async (req: AuthedRequest, res) => {
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

  const actuales = q.photosOfEntry.all(entrada.id) as { id: string; archivo: string }[]
  const crudo = req.body?.orden
  const orden: string[] = (Array.isArray(crudo) ? crudo : crudo ? [crudo] : []).map(String)
  const conservados = orden.filter((item) => actuales.some((p) => p.id === item))
  const eliminados = actuales.filter((p) => !conservados.includes(p.id))

  const archivos = await guardarArchivos((req.files as Express.Multer.File[]) ?? [])
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.updateEntry.run(campos.fecha, campos.fechaFin, campos.nota, entrada.id)
    eliminados.forEach((p) => q.deletePhoto.run(p.id))
    orden.forEach((item, posicion) => {
      const nuevo = /^nuevo:(\d+)$/.exec(item)
      if (nuevo) {
        const archivo = archivos[Number(nuevo[1])]
        if (archivo) q.insertPhoto.run(randomUUID(), entrada.id, posicion, archivo, ahora)
      } else if (conservados.includes(item)) {
        q.updatePhotoPos.run(posicion, item)
      }
    })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    await Promise.all(archivos.map((a) => unlink(join(UPLOADS_DIR, a)).catch(() => {})))
    throw e
  }
  // Only unlink after the transaction committed, so a rollback can't leave
  // rows pointing at files that are already gone.
  await Promise.all(eliminados.map((p) => unlink(join(UPLOADS_DIR, p.archivo)).catch(() => {})))
  res.json(entradaConFotos(q.entryById.get(entrada.id, coupleId) as FilaEntry))
})

/** Photo files. Cookie-authenticated so <img> works, and scoped to the
 * caller's couple so a leaked id is useless to anyone else. */
app.get('/api/photos/:id', requireCookie, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  const foto = q.photoForCouple.get(req.params.id, coupleId) as { archivo: string } | undefined
  if (!foto) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  res.setHeader('Content-Type', 'image/webp')
  // Filenames are random and never reused, so the bytes behind an id never
  // change — but keep it private so no shared cache holds onto them.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  createReadStream(join(UPLOADS_DIR, foto.archivo)).on('error', () => res.sendStatus(404)).pipe(res)
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`duette-server escuchando en 127.0.0.1:${PORT}`)
})
