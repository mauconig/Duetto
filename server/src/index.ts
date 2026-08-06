import express from 'express'
import { randomUUID } from 'node:crypto'
import { db, generateCode, normalizeCode } from './db.ts'
import { requireAuth, type AuthedRequest } from './auth.ts'

const PORT = Number(process.env.PORT ?? 8790)
const MAX_MIEMBROS = 2

const app = express()
app.use(express.json({ limit: '1mb' }))

const q = {
  memberByUser: db.prepare('SELECT * FROM members WHERE user_id = ?'),
  coupleById: db.prepare('SELECT * FROM couples WHERE id = ?'),
  coupleByCode: db.prepare('SELECT * FROM couples WHERE code = ?'),
  membersOfCouple: db.prepare('SELECT user_id, nombre FROM members WHERE couple_id = ? ORDER BY joined_at'),
  insertCouple: db.prepare('INSERT INTO couples (id, code, created_at) VALUES (?, ?, ?)'),
  insertMember: db.prepare('INSERT INTO members (user_id, couple_id, nombre, joined_at) VALUES (?, ?, ?, ?)'),
  updateNombre: db.prepare('UPDATE members SET nombre = ? WHERE user_id = ?'),
  updatePerfil: db.prepare('UPDATE couples SET fecha_aniversario = ?, proximo_hito = ? WHERE id = ?'),
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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`duette-server escuchando en 127.0.0.1:${PORT}`)
})
