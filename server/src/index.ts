import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import { almacen } from './almacen.ts'
import { db, generateCode, normalizeCode, sembrarIdeas } from './db.ts'
import { emitirCookie, requireAuth, requireCookie, type AuthedRequest } from './auth.ts'

const PORT = Number(process.env.PORT ?? 8790)
const MAX_MIEMBROS = 2
const MAX_FOTOS = 30
/** Free tier, per couple, across recuerdos + staging + inspiración combined.
 * Premium couples (see `couples.premium`) get MAX_STORAGE_BYTES_PREMIUM
 * instead — see plan.md for the monetization strategy this is meant to
 * hook into. */
const MAX_STORAGE_BYTES = Number(process.env.DUETTE_MAX_STORAGE_BYTES ?? 500 * 1024 * 1024)
const MAX_STORAGE_BYTES_PREMIUM = Number(process.env.DUETTE_MAX_STORAGE_BYTES_PREMIUM ?? 5 * 1024 * 1024 * 1024)
/** Same wording whether the cap is hit by multer, before the route runs, or
 * by the staging count once it does. */
const DEMASIADAS = `No podés subir más de ${MAX_FOTOS} fotos por recuerdo`
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
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_FOTOS * 2 },
})

const app = express()
// The server only ever sees Caddy's own address otherwise — everything
// below that reads req.ip (the rate limiters) would be keying on one IP for
// every visitor and limiting nobody.
app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

/** Baseline against scripted flooding — generous enough that normal use
 * never brushes it, tight enough that a script hammering the API gets
 * throttled instead of served. */
const limiteGlobal = rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false })
app.use('/api', limiteGlobal)

/** Invite codes are 6 chars from a 32-symbol alphabet — ~1.07 billion
 * combinations, but nothing before this stopped a script from just trying
 * all of them. A couple only ever accepts one more member, so a correct
 * guess is worth exactly one join; this is what makes guessing itself
 * expensive. */
const limiteJoin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, esperá un rato antes de volver a probar' },
})

/** Each hit makes the server fetch a page and an image on the caller's
 * behalf — already host-allowlisted and size-capped against SSRF, but still
 * outbound requests worth bounding the rate of. */
const limiteEnlace = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })

/** Complements the byte-size cap below: that bounds total storage, this
 * bounds how fast a script can try to fill it. */
const limiteSubida = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })

const q = {
  memberByUser: db.prepare('SELECT * FROM members WHERE user_id = ?'),
  coupleById: db.prepare('SELECT * FROM couples WHERE id = ?'),
  coupleByCode: db.prepare('SELECT * FROM couples WHERE code = ?'),
  membersOfCouple: db.prepare(
    'SELECT user_id, nombre, imagen_url, cifrado FROM members WHERE couple_id = ? ORDER BY joined_at',
  ),
  updateImagen: db.prepare('UPDATE members SET imagen_url = ? WHERE user_id = ?'),
  insertCouple: db.prepare('INSERT INTO couples (id, code, created_at) VALUES (?, ?, ?)'),
  insertMember: db.prepare(
    'INSERT INTO members (user_id, couple_id, nombre, joined_at, privacidad_version, privacidad_at, cifrado) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),

  /* Encryption. The server stores these and hands them back; it never derives
   * anything from them. `activar` is one-way on purpose — there is no route
   * that clears the wrapped key, because that would be a route that destroys
   * every photo, reachable by anyone who ever steals a session. */
  cifradoDeCouple: db.prepare(
    'SELECT cifrado_activo, llave_envuelta, kdf_salt, kdf_params, llave_codigo, kdf_salt_codigo FROM couples WHERE id = ?',
  ),
  activarCifrado: db.prepare(`
    UPDATE couples
       SET cifrado_activo = 1, llave_envuelta = ?, kdf_salt = ?, kdf_params = ?,
           llave_codigo = ?, kdf_salt_codigo = ?
     WHERE id = ? AND cifrado_activo = 0
  `),
  /** Rewrapping the same couple key under a new passphrase. Never touches
   * llave_codigo: the recovery code keeps working, which is the whole reason
   * it exists. */
  reenvolverFrase: db.prepare(
    'UPDATE couples SET llave_envuelta = ?, kdf_salt = ?, kdf_params = ? WHERE id = ? AND cifrado_activo = 1',
  ),

  /* The migration of what already exists: same row, ciphertext in place of the
   * plaintext it used to point at. Old object names are returned first so the
   * bytes they name can be deleted only after the row stopped referring to
   * them — the other order loses photos if the write fails. */
  cifrarPhoto: db.prepare('UPDATE photos SET archivo = ?, archivo_min = ?, tam_bytes = ?, cifrado = 1 WHERE id = ?'),
  cifrarInspiracion: db.prepare(
    'UPDATE inspiraciones SET archivo = ?, archivo_min = ?, tam_bytes = ?, cifrado = 1 WHERE id = ? AND couple_id = ?',
  ),
  /** What still has to be migrated, oldest first so progress is visible. */
  photosSinCifrar: db.prepare(`
    SELECT p.id FROM photos p JOIN entries e ON e.id = p.entry_id
     WHERE e.couple_id = ? AND p.cifrado = 0 ORDER BY p.created_at
  `),
  inspiracionesSinCifrar: db.prepare(
    'SELECT id FROM inspiraciones WHERE couple_id = ? AND cifrado = 0 ORDER BY created_at',
  ),
  /** Text rows still in the clear, for the same sweep. */
  entriesSinCifrar: db.prepare(
    "SELECT id, nota FROM entries WHERE couple_id = ? AND cifrado = 0 AND nota IS NOT NULL AND nota <> ''",
  ),
  categoriasSinCifrar: db.prepare('SELECT id, nombre FROM categorias WHERE couple_id = ? AND cifrado = 0'),
  ideasSinCifrar: db.prepare('SELECT id, texto FROM ideas WHERE couple_id = ? AND cifrado = 0'),
  cifrarEntryNota: db.prepare('UPDATE entries SET nota = ?, cifrado = 1 WHERE id = ? AND couple_id = ?'),
  cifrarCategoria: db.prepare('UPDATE categorias SET nombre = ?, cifrado = 1 WHERE id = ? AND couple_id = ?'),
  cifrarIdea: db.prepare('UPDATE ideas SET texto = ?, cifrado = 1 WHERE id = ? AND couple_id = ?'),
  updateNombre: db.prepare('UPDATE members SET nombre = ?, cifrado = ? WHERE user_id = ?'),
  updatePerfil: db.prepare('UPDATE couples SET fecha_aniversario = ?, proximo_hito = ? WHERE id = ?'),
  deleteMember: db.prepare('DELETE FROM members WHERE user_id = ?'),
  deleteCouple: db.prepare('DELETE FROM couples WHERE id = ?'),

  entriesOfCouple: db.prepare('SELECT * FROM entries WHERE couple_id = ? ORDER BY fecha, created_at'),
  entryById: db.prepare('SELECT * FROM entries WHERE id = ? AND couple_id = ?'),
  insertEntry: db.prepare(
    'INSERT INTO entries (id, couple_id, fecha, fecha_fin, nota, fondo, created_by, created_at, cifrado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  updateEntry: db.prepare('UPDATE entries SET fecha = ?, fecha_fin = ?, nota = ?, cifrado = ? WHERE id = ?'),
  deleteEntry: db.prepare('DELETE FROM entries WHERE id = ?'),
  photosOfEntry: db.prepare('SELECT id, archivo, archivo_min, posicion, cifrado FROM photos WHERE entry_id = ? ORDER BY posicion'),
  photosOfCouple: db.prepare(
    'SELECT p.id, p.entry_id, p.posicion FROM photos p JOIN entries e ON e.id = p.entry_id WHERE e.couple_id = ? ORDER BY p.posicion',
  ),
  insertPhoto: db.prepare(
    'INSERT INTO photos (id, entry_id, posicion, archivo, archivo_min, tam_bytes, created_at, cifrado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  updatePhotoPos: db.prepare('UPDATE photos SET posicion = ? WHERE id = ?'),
  deletePhoto: db.prepare('DELETE FROM photos WHERE id = ?'),
  /** Joined against entries so a photo id from one couple can never be read
   * or deleted by another. */
  photoForCouple: db.prepare(
    'SELECT p.archivo, p.archivo_min, p.cifrado FROM photos p JOIN entries e ON e.id = p.entry_id WHERE p.id = ? AND e.couple_id = ?',
  ),
  /** Every file the couple owns, for cleaning up after the last member leaves. */
  photoFilesOfCouple: db.prepare(
    'SELECT p.archivo, p.archivo_min FROM photos p JOIN entries e ON e.id = p.entry_id WHERE e.couple_id = ?',
  ),

  insertStaged: db.prepare(
    'INSERT INTO staged_photos (id, couple_id, archivo, archivo_min, tam_bytes, created_at, cifrado) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),
  /** Scoped to the couple, so an id from the other couple resolves to
   * nothing rather than handing over their photo. */
  stagedForCouple: db.prepare(
    'SELECT archivo, archivo_min, tam_bytes, cifrado FROM staged_photos WHERE id = ? AND couple_id = ?',
  ),
  deleteStaged: db.prepare('DELETE FROM staged_photos WHERE id = ?'),
  countStaged: db.prepare('SELECT COUNT(*) AS n FROM staged_photos WHERE couple_id = ?'),
  stagedFilesOfCouple: db.prepare('SELECT archivo, archivo_min FROM staged_photos WHERE couple_id = ?'),
  stagedVencidas: db.prepare('SELECT id, archivo, archivo_min FROM staged_photos WHERE couple_id = ? AND created_at < ?'),

  categoriasOfCouple: db.prepare('SELECT id, nombre, cifrado FROM categorias WHERE couple_id = ? ORDER BY posicion, created_at'),
  categoriaForCouple: db.prepare('SELECT id FROM categorias WHERE id = ? AND couple_id = ?'),
  countCategorias: db.prepare('SELECT COUNT(*) AS n FROM categorias WHERE couple_id = ?'),
  maxPosCategoria: db.prepare('SELECT MAX(posicion) AS maxpos FROM categorias WHERE couple_id = ?'),
  insertCategoria: db.prepare('INSERT INTO categorias (id, couple_id, nombre, posicion, created_at, cifrado) VALUES (?, ?, ?, ?, ?, ?)'),
  updateCategoria: db.prepare('UPDATE categorias SET nombre = ?, posicion = ?, cifrado = ? WHERE id = ? AND couple_id = ?'),
  deleteCategoria: db.prepare('DELETE FROM categorias WHERE id = ? AND couple_id = ?'),

  inspiracionesOfCouple: db.prepare(
    'SELECT id, categoria_id, nota, es_video, url_origen, cifrado FROM inspiraciones WHERE couple_id = ? ORDER BY created_at DESC',
  ),
  countInspiraciones: db.prepare('SELECT COUNT(*) AS n FROM inspiraciones WHERE couple_id = ?'),
  insertInspiracion: db.prepare(
    'INSERT INTO inspiraciones (id, couple_id, categoria_id, archivo, archivo_min, tam_bytes, nota, es_video, url_origen, created_at, cifrado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  inspiracionForCouple: db.prepare('SELECT archivo, archivo_min, cifrado FROM inspiraciones WHERE id = ? AND couple_id = ?'),
  moveInspiracion: db.prepare('UPDATE inspiraciones SET categoria_id = ? WHERE id = ? AND couple_id = ?'),
  deleteInspiracion: db.prepare('DELETE FROM inspiraciones WHERE id = ? AND couple_id = ?'),
  inspiracionFilesOfCouple: db.prepare('SELECT archivo, archivo_min FROM inspiraciones WHERE couple_id = ?'),

  ideasOfCouple: db.prepare('SELECT id, texto, cifrado FROM ideas WHERE couple_id = ? ORDER BY posicion, created_at'),
  countIdeas: db.prepare('SELECT COUNT(*) AS n FROM ideas WHERE couple_id = ?'),
  maxPosIdea: db.prepare('SELECT MAX(posicion) AS maxpos FROM ideas WHERE couple_id = ?'),
  insertIdea: db.prepare('INSERT INTO ideas (id, couple_id, texto, posicion, created_at, cifrado) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteIdea: db.prepare('DELETE FROM ideas WHERE id = ? AND couple_id = ?'),

  /** Bytes across recuerdos, staging and inspiración combined — the three
   * places a couple's files live. Legacy rows with no tam_bytes recorded
   * contribute 0, not an error: SUM ignores NULLs. */
  storageUsedByCouple: db.prepare(`
    SELECT COALESCE(SUM(tam_bytes), 0) AS bytes FROM (
      SELECT p.tam_bytes FROM photos p JOIN entries e ON e.id = p.entry_id WHERE e.couple_id = ?
      UNION ALL
      SELECT tam_bytes FROM staged_photos WHERE couple_id = ?
      UNION ALL
      SELECT tam_bytes FROM inspiraciones WHERE couple_id = ?
    )
  `),
  couplePremium: db.prepare('SELECT premium FROM couples WHERE id = ?'),

  // For the tam_bytes backfill: rows saved before size tracking existed.
  photosSinTamano: db.prepare('SELECT id, archivo, archivo_min FROM photos WHERE tam_bytes IS NULL'),
  updatePhotoTamano: db.prepare('UPDATE photos SET tam_bytes = ? WHERE id = ?'),
  stagedSinTamano: db.prepare('SELECT id, archivo, archivo_min FROM staged_photos WHERE tam_bytes IS NULL'),
  updateStagedTamano: db.prepare('UPDATE staged_photos SET tam_bytes = ? WHERE id = ?'),
  inspiracionesSinTamano: db.prepare('SELECT id, archivo, archivo_min FROM inspiraciones WHERE tam_bytes IS NULL'),
  updateInspiracionTamano: db.prepare('UPDATE inspiraciones SET tam_bytes = ? WHERE id = ?'),
}

/** Bytes this couple's recuerdos, staging and inspiración currently take up. */
function usoStorage(coupleId: string): number {
  const { bytes } = q.storageUsedByCouple.get(coupleId, coupleId, coupleId) as { bytes: number }
  return Number(bytes)
}

/** The cap this couple is under: the premium tier's 5GB, or the free 500MB. */
function limiteStorage(coupleId: string): number {
  const fila = q.couplePremium.get(coupleId) as { premium: number } | undefined
  return Number(fila?.premium) ? MAX_STORAGE_BYTES_PREMIUM : MAX_STORAGE_BYTES
}

/** Room left under whichever cap applies. */
function espacioDisponible(coupleId: string): number {
  return limiteStorage(coupleId) - usoStorage(coupleId)
}

/** Combined size of whatever multer buffered for these field(s), the same
 * number that ends up in tam_bytes once the files are saved. */
function tamanoDe(...grupos: (Express.Multer.File[] | undefined)[]): number {
  return grupos.reduce((total, files) => total + (files ?? []).reduce((s, f) => s + f.buffer.length, 0), 0)
}

/** Combined size of a photo's full file plus its thumbnail, read straight
 * from the store — what a row from before tam_bytes existed has to go on. */
async function tamanoEnAlmacen(archivo: string, archivoMin: string | null): Promise<number> {
  const [a, b] = await Promise.all([almacen.tamano(archivo), archivoMin ? almacen.tamano(archivoMin) : null])
  return (a ?? 0) + (b ?? 0)
}

/** Fills tam_bytes for whatever this table still has null — rows saved
 * before size tracking shipped. Runs on every boot but is cheap once done:
 * the WHERE clause means a second boot finds nothing left to do. A file
 * that fails to measure (a stray HEAD error) just stays null and gets
 * retried next boot, rather than taking the whole server down with it. */
async function backfillTabla(
  tabla: string,
  select: { all(): unknown[] },
  update: { run(bytes: number, id: string): unknown },
) {
  const filas = select.all() as { id: string; archivo: string; archivo_min: string | null }[]
  let hechos = 0
  for (const fila of filas) {
    try {
      update.run(await tamanoEnAlmacen(fila.archivo, fila.archivo_min), fila.id)
      hechos++
    } catch (e) {
      console.error(`no se pudo medir ${tabla} ${fila.id}:`, e)
    }
  }
  return hechos
}

async function backfillTamanos() {
  const hechos =
    (await backfillTabla('photos', q.photosSinTamano, q.updatePhotoTamano)) +
    (await backfillTabla('staged_photos', q.stagedSinTamano, q.updateStagedTamano)) +
    (await backfillTabla('inspiraciones', q.inspiracionesSinTamano, q.updateInspiracionTamano))
  if (hechos > 0) console.log(`tam_bytes: calculado para ${hechos} fotos existentes`)
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
    premium: number
  }
  const miembros = q.membersOfCouple.all(coupleId) as {
    user_id: string
    nombre: string
    imagen_url: string | null
  }[]
  const yo = miembros.find((m) => m.user_id === userId)
  const pareja = miembros.find((m) => m.user_id !== userId)
  return {
    coupleId: couple.id,
    codigo: couple.code,
    nombrePropio: yo?.nombre ?? null,
    nombrePareja: pareja?.nombre ?? null,
    // Only the partner's. The caller's own avatar comes from Clerk in the
    // browser, where it's already loaded and always current — echoing back
    // what they just told us would only be staler.
    imagenPareja: pareja?.imagen_url ?? null,
    fechaAniversario: couple.fecha_aniversario,
    proximoHito: couple.proximo_hito,
    vinculada: miembros.length >= MAX_MIEMBROS,
    premium: !!Number(couple.premium),
    espacioUsado: usoStorage(coupleId),
    espacioLimite: limiteStorage(coupleId),
    cifrado: estadoCifrado(coupleId),
  }
}

/** What the client needs to *try* an unlock, and nothing that helps anyone
 * else do it. Handing back the wrapped key is safe by construction — without
 * the passphrase or the recovery code it is 32 bytes of noise, and whoever
 * could read this response could already read the database.
 *
 * `pendientes` is what the migration screen counts down: rows still holding
 * plaintext after encryption was turned on. Zero means the couple's history
 * finished moving over. */
function estadoCifrado(coupleId: string) {
  const c = q.cifradoDeCouple.get(coupleId) as
    | {
        cifrado_activo: number
        llave_envuelta: string | null
        kdf_salt: string | null
        kdf_params: string | null
        llave_codigo: string | null
        kdf_salt_codigo: string | null
      }
    | undefined
  const activo = !!Number(c?.cifrado_activo)
  if (!activo || !c?.llave_envuelta) return { activo: false as const }
  return {
    activo: true as const,
    llaveEnvuelta: c.llave_envuelta,
    kdfSalt: c.kdf_salt,
    kdfParams: c.kdf_params ? (JSON.parse(c.kdf_params) as unknown) : null,
    llaveCodigo: c.llave_codigo,
    kdfSaltCodigo: c.kdf_salt_codigo,
    pendientes: cuantoFaltaCifrar(coupleId),
  }
}

function cuantoFaltaCifrar(coupleId: string) {
  return {
    fotos: (q.photosSinCifrar.all(coupleId) as unknown[]).length,
    inspiraciones: (q.inspiracionesSinCifrar.all(coupleId) as unknown[]).length,
    notas: (q.entriesSinCifrar.all(coupleId) as unknown[]).length,
    carpetas: (q.categoriasSinCifrar.all(coupleId) as unknown[]).length,
    ideas: (q.ideasSinCifrar.all(coupleId) as unknown[]).length,
  }
}

/** Whether the client says this value arrives already encrypted. The server
 * takes its word for it because it has no way to check — that is what E2EE
 * means here — and stores the flag so it can hand the same bytes back and let
 * the client decide what to do with them. */
function banderaCifrado(req: AuthedRequest): 0 | 1 {
  const v = req.body?.cifrado
  return v === true || v === 'true' || v === 1 || v === '1' ? 1 : 0
}

/** Length caps stop being enforceable once a field is ciphertext: the server
 * sees base64 of an envelope, not the 30 characters someone typed. The client
 * enforces the real limit; this keeps a bound anyway so an encrypted field
 * can't be used to store arbitrary amounts of data.
 *
 * The envelope adds a version byte, a 12-byte IV and GCM's 16-byte tag, then
 * base64 costs 4 bytes for every 3. UTF-8 can also take up to 4 bytes per
 * character, which is why the plaintext limit is multiplied before wrapping —
 * an emoji-only name has to still fit. */
function limiteTexto(caracteres: number, cifrado: 0 | 1): number {
  if (!cifrado) return caracteres
  return Math.ceil((caracteres * 4 + 29) * 4 / 3) + 4
}

/** Which version of the privacy policy the client says it showed. Recorded
 * as evidence of consent, so it takes whatever the client sent rather than a
 * constant here — the point is to know what the person actually read, and a
 * server-side constant would just record what was current at insert time.
 * Unrecognisable input is stored as null instead of being trusted. */
function versionPrivacidad(req: AuthedRequest): string | null {
  const v = String(req.body?.privacidadVersion ?? '').trim()
  return /^\d+\.\d+$/.test(v) ? v : null
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
    q.updateNombre.run(nombre, banderaCifrado(req), req.userId!)
    res.json(estadoPareja(existente.couple_id, req.userId!))
    return
  }

  const id = randomUUID()
  const code = generateCode()
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.insertCouple.run(id, code, ahora)
    q.insertMember.run(req.userId!, id, nombre, ahora, versionPrivacidad(req), ahora, banderaCifrado(req))
    sembrarIdeas(id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  res.status(201).json(estadoPareja(id, req.userId!))
})

/** Join an existing couple with the code the other partner shared. */
app.post('/api/couple/join', requireAuth, limiteJoin, (req: AuthedRequest, res) => {
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

  const ahoraJoin = new Date().toISOString()
  q.insertMember.run(req.userId!, couple.id, nombre, ahoraJoin, versionPrivacidad(req), ahoraJoin, banderaCifrado(req))
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
  if (nombre) q.updateNombre.run(nombre, banderaCifrado(req), req.userId!)
  res.json(estadoPareja(member.couple_id, req.userId!))
})

/** Leaves the couple — the way out of joining with the wrong code.
 *
 * If the other partner is still there they keep everything: the memories
 * belong to the couple, not to whoever uploaded them. The leaver can rejoin
 * later with the same code, since the couple is back down to one member.
 * If nobody is left the couple has no reason to exist, so it goes with its
 * entries, photos and ideas. */
/** Hosts a Clerk avatar can legitimately come from. Clerk normally rewrites
 * everything through img.clerk.com, but a Google account can still surface
 * its original googleusercontent URL depending on how the account was
 * connected. */
const HOSTS_AVATAR = new Set(['img.clerk.com', 'images.clerk.dev', 'lh3.googleusercontent.com'])

/** Remembers where this person's avatar lives, so their partner can see it.
 *
 * The browser reports its own URL rather than the server asking Clerk for
 * it: the client already has it loaded, always current, and this way there
 * is no Clerk API call on the path of every app open.
 *
 * The cost of trusting the client is that a caller could name any URL, and
 * whatever they name is rendered as an <img src> inside their partner's app.
 * The host list is what keeps that from being an arbitrary beacon pointed at
 * someone else's browser. */
app.put('/api/me/imagen', requireAuth, (req: AuthedRequest, res) => {
  const crudo = String(req.body?.imagenUrl ?? '').trim()

  // Empty means they removed their photo, and initials come back.
  if (!crudo) {
    q.updateImagen.run(null, req.userId!)
    res.json({ ok: true, imagenUrl: null })
    return
  }

  let url: URL
  try {
    url = new URL(crudo)
  } catch {
    res.status(400).json({ error: 'Esa imagen no es válida' })
    return
  }
  if (url.protocol !== 'https:' || !HOSTS_AVATAR.has(url.hostname)) {
    res.status(400).json({ error: 'Esa imagen no es válida' })
    return
  }

  q.updateImagen.run(url.href, req.userId!)
  res.json({ ok: true, imagenUrl: url.href })
})

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

  // Staging and inspiraciones included: they belong to nobody once the
  // couple is gone, and nothing else would ever come looking for them.
  const archivos = [
    ...(q.photoFilesOfCouple.all(member.couple_id) as { archivo: string; archivo_min: string | null }[]),
    ...(q.stagedFilesOfCouple.all(member.couple_id) as { archivo: string; archivo_min: string | null }[]),
    ...(q.inspiracionFilesOfCouple.all(member.couple_id) as { archivo: string; archivo_min: string | null }[]),
  ]
  // ON DELETE CASCADE takes members, entries, photos, staging, ideas,
  // categorías and inspiraciones.
  q.deleteCouple.run(member.couple_id)
  // Files go last: a failure here leaves orphans in the store rather than rows
  // pointing at photos that no longer exist.
  await almacen.borrar(archivos.flatMap(nombresDe))
  res.json({ ok: true, parejaBorrada: true })
})

/* ---------------------------------------------------------------- cifrado */

/** base64 of something the server never opens. Bounded so these columns can't
 * become general-purpose storage: a wrapped 256-bit key is 60 characters. */
function leerBase64(valor: unknown, maxBytes: number): string | null {
  const s = String(valor ?? '')
  if (!s || s.length > Math.ceil(maxBytes * 4 / 3) + 4) return null
  return /^[A-Za-z0-9+/]+=*$/.test(s) ? s : null
}

/** Turning encryption on. Everything here was produced on the device and is
 * opaque to us: the couple key wrapped by the passphrase, the same key wrapped
 * by the recovery code, and the two salts.
 *
 * Both wraps are required together, which is the mechanism behind the promise
 * on the screen — encryption cannot be enabled without recovery existing,
 * because there is no request shape that expresses it.
 *
 * The UPDATE carries `cifrado_activo = 0` in its WHERE, so a second call can
 * never overwrite a live key. That is the difference between a repeated tap
 * and every photo becoming unreadable. */
app.post('/api/cifrado/activar', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const llaveEnvuelta = leerBase64(req.body?.llaveEnvuelta, 64)
  const kdfSalt = leerBase64(req.body?.kdfSalt, 32)
  const llaveCodigo = leerBase64(req.body?.llaveCodigo, 64)
  const kdfSaltCodigo = leerBase64(req.body?.kdfSaltCodigo, 32)
  const params = req.body?.kdfParams
  if (!llaveEnvuelta || !kdfSalt || !llaveCodigo || !kdfSaltCodigo || !params) {
    res.status(400).json({ error: 'Faltan datos para activar el cifrado' })
    return
  }

  const cambio = q.activarCifrado.run(
    llaveEnvuelta,
    kdfSalt,
    JSON.stringify(params),
    llaveCodigo,
    kdfSaltCodigo,
    coupleId,
  )
  if (Number(cambio.changes) === 0) {
    res.status(409).json({ error: 'El cifrado ya estaba activado' })
    return
  }
  res.json(estadoPareja(coupleId, req.userId!))
})

/** Changing the passphrase. It rewraps the same couple key, so nothing already
 * encrypted has to be touched — and the recovery code keeps working, because
 * this never writes llave_codigo. */
app.post('/api/cifrado/frase', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const llaveEnvuelta = leerBase64(req.body?.llaveEnvuelta, 64)
  const kdfSalt = leerBase64(req.body?.kdfSalt, 32)
  const params = req.body?.kdfParams
  if (!llaveEnvuelta || !kdfSalt || !params) {
    res.status(400).json({ error: 'Faltan datos para cambiar la frase' })
    return
  }
  const cambio = q.reenvolverFrase.run(llaveEnvuelta, kdfSalt, JSON.stringify(params), coupleId)
  if (Number(cambio.changes) === 0) {
    res.status(409).json({ error: 'El cifrado no está activado' })
    return
  }
  res.json({ ok: true })
})

/** What the migration still has to get through, and the ciphertext for the
 * rows it can move without re-uploading anything. Photos aren't here: their
 * bytes are fetched and replaced one at a time through the route below. */
app.get('/api/cifrado/pendientes', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  res.json({
    fotos: (q.photosSinCifrar.all(coupleId) as { id: string }[]).map((r) => r.id),
    inspiraciones: (q.inspiracionesSinCifrar.all(coupleId) as { id: string }[]).map((r) => r.id),
    notas: q.entriesSinCifrar.all(coupleId),
    carpetas: q.categoriasSinCifrar.all(coupleId),
    ideas: q.ideasSinCifrar.all(coupleId),
  })
})

/** Replaces a row's text with its encrypted form. One row per call: the
 * migration runs on someone's phone and can stop at any moment, so each step
 * has to be complete on its own rather than part of a batch that half applied. */
app.post('/api/cifrado/texto', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const id = String(req.body?.id ?? '')
  const valor = String(req.body?.valor ?? '')
  const tipo = String(req.body?.tipo ?? '')
  if (!id || !valor) {
    res.status(400).json({ error: 'Faltan datos' })
    return
  }
  const donde =
    tipo === 'nota' ? q.cifrarEntryNota : tipo === 'carpeta' ? q.cifrarCategoria : tipo === 'idea' ? q.cifrarIdea : null
  if (!donde) {
    res.status(400).json({ error: 'Faltan datos' })
    return
  }
  const cambio = donde.run(valor, id, coupleId)
  if (Number(cambio.changes) === 0) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  res.json({ ok: true })
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
  cifrado: number
}

function entradaConFotos(fila: FilaEntry) {
  const fotos = q.photosOfEntry.all(fila.id) as { id: string }[]
  return {
    id: fila.id,
    fecha: fila.fecha,
    fechaFin: fila.fecha_fin ?? undefined,
    nota: fila.nota ?? undefined,
    // Says whether `nota` is ciphertext. Without it the client would render
    // base64 as if it were what someone wrote.
    cifrado: !!Number(fila.cifrado),
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
  const cifrado: 0 | 1 = body.cifrado === true || body.cifrado === 'true' || body.cifrado === '1' ? 1 : 0
  const fecha = String(body.fecha ?? '').trim()
  const fechaFin = String(body.fechaFin ?? '').trim()
  // Only the nota is ever ciphertext. The dates stay readable on purpose —
  // they order the timeline and feed "recuerdo del día", and encrypting them
  // would kill both. That leak is in plan.md, deliberate and written down.
  const nota = cifrado ? String(body.nota ?? '') : String(body.nota ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  if (fechaFin && !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) return null
  // Only bounded when encrypted. A plain nota never had a limit beyond the
  // request body's, and adding one here would start rejecting notes people
  // already wrote.
  if (cifrado && nota.length > limiteTexto(2000, 1)) return null
  return { fecha, fechaFin: fechaFin || null, nota: nota || null, cifrado }
}

interface ParGuardado {
  archivo: string
  min: string | null
  bytes: number
  /** Travels with the pair because one request can mix photos staged before
   * encryption was on with files uploaded after it. Each row has to record
   * what its own bytes are, not what the request as a whole was. */
  cifrado: 0 | 1
}

/** The browser sends each photo twice — full size and an 800px copy — as
 * two parallel arrays, so index n of `miniaturas` belongs to index n of
 * `fotos`. A missing thumbnail is tolerated: the reader falls back to the
 * full file rather than showing a hole. */
async function guardarArchivos(
  files: Express.Multer.File[],
  minis: Express.Multer.File[],
  cifrado: 0 | 1 = 0,
): Promise<ParGuardado[]> {
  const guardados: ParGuardado[] = []
  for (let i = 0; i < files.length; i++) {
    const archivo = `${randomUUID()}.webp`
    await almacen.guardar(archivo, files[i].buffer)
    let min: string | null = null
    let bytes = files[i].buffer.length
    if (minis[i]) {
      min = `${randomUUID()}.webp`
      await almacen.guardar(min, minis[i].buffer)
      bytes += minis[i].buffer.length
    }
    guardados.push({ archivo, min, bytes, cifrado })
  }
  return guardados
}

/** Both names of a stored photo, skipping the thumbnail when there isn't one. */
function nombresDe(p: { archivo: string; archivo_min?: string | null }): string[] {
  return p.archivo_min ? [p.archivo, p.archivo_min] : [p.archivo]
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

/** Swaps one existing photo's bytes for their encrypted form, in place.
 *
 * This is the shape the migration of an existing history takes, and it can
 * only run from a device that holds the key — that is the whole point, and
 * what separates it from migrar-a-r2.ts, which ran on the VPS because moving
 * opaque bytes needs no key at all.
 *
 * Order matters and is not incidental: the new objects are written, then the
 * row is pointed at them, and only then are the old ones deleted. Any other
 * order can leave a row naming bytes that no longer exist, which is a photo
 * lost for good. A crash here leaks two objects instead — recoverable. */
app.post('/api/cifrado/foto/:id', requireAuth, limiteSubida, campoUnaFoto, async (req: AuthedRequest, res) => {
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
  const esInspiracion = req.body?.tipo === 'inspiracion'
  const anterior = (
    esInspiracion ? q.inspiracionForCouple.get(req.params.id, coupleId) : q.photoForCouple.get(req.params.id, coupleId)
  ) as { archivo: string; archivo_min: string | null; cifrado: number } | undefined
  if (!anterior) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  // Already done. Answering ok rather than erroring keeps a retried migration
  // idempotent, which matters when the thing driving it is a phone on mobile
  // data that may repeat a request it never saw the answer to.
  if (Number(anterior.cifrado)) {
    res.json({ ok: true, yaEstaba: true })
    return
  }

  // Everything this route stores is ciphertext by definition — that is what
  // it exists to produce.
  const [par] = await guardarArchivos([foto], files.miniatura ?? [], 1)
  try {
    const cambio = esInspiracion
      ? q.cifrarInspiracion.run(par.archivo, par.min, par.bytes, req.params.id, coupleId)
      : q.cifrarPhoto.run(par.archivo, par.min, par.bytes, req.params.id)
    if (Number(cambio.changes) === 0) throw new Error('la fila desapareció durante la migración')
  } catch (e) {
    // The row still names the old bytes, so what has to go is what we just
    // wrote — the opposite of the success path.
    await almacen.borrar(nombresDe({ archivo: par.archivo, archivo_min: par.min }))
    throw e
  }
  await almacen.borrar(nombresDe(anterior))
  res.json({ ok: true })
})

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
  await almacen.borrar(vencidas.flatMap(nombresDe))
}

/** Takes one downscaled photo and holds onto it until a recuerdo claims it.
 * The sheet calls this as each photo finishes downscaling, so by the time
 * the user presses save the bytes are already here and the entry request
 * carries no files at all. */
const ESPACIO_LLENO = 'Llegaste al límite de espacio de tu pareja'

app.post('/api/photos', requireAuth, limiteSubida, campoUnaFoto, async (req: AuthedRequest, res) => {
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

  const cifrado = banderaCifrado(req)

  await barrerStaging(coupleId)

  // A sheet that's abandoned over and over shouldn't be able to fill the
  // disk before the sweep catches up.
  const { n } = q.countStaged.get(coupleId) as { n: number }
  if (Number(n) >= MAX_FOTOS) {
    res.status(409).json({ error: DEMASIADAS })
    return
  }

  if (tamanoDe([foto], files.miniatura) > espacioDisponible(coupleId)) {
    res.status(413).json({ error: ESPACIO_LLENO })
    return
  }

  const [par] = await guardarArchivos([foto], files.miniatura ?? [], cifrado)
  const id = randomUUID()
  try {
    q.insertStaged.run(id, coupleId, par.archivo, par.min, par.bytes, new Date().toISOString(), cifrado)
  } catch (e) {
    await almacen.borrar(nombresDe({ archivo: par.archivo, archivo_min: par.min }))
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
    const fila = q.stagedForCouple.get(m[1], coupleId) as
      | { archivo: string; archivo_min: string | null; tam_bytes: number | null; cifrado: number }
      | undefined
    if (!fila) return null
    encontradas.set(m[1], {
      archivo: fila.archivo,
      min: fila.archivo_min,
      bytes: Number(fila.tam_bytes ?? 0),
      cifrado: Number(fila.cifrado) ? 1 : 0,
    })
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
      q.insertPhoto.run(randomUUID(), entryId, posicion, par.archivo, par.min, par.bytes, ahora, par.cifrado)
      q.deleteStaged.run(est[1])
      return
    }
    const nuevo = RE_NUEVO.exec(item)
    if (nuevo) {
      const par = archivos[Number(nuevo[1])]
      if (par) q.insertPhoto.run(randomUUID(), entryId, posicion, par.archivo, par.min, par.bytes, ahora, par.cifrado)
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

app.post('/api/entries', requireAuth, limiteSubida, camposSubida, async (req: AuthedRequest, res) => {
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
  // Only the freshly-uploaded files count here — anything claimed by
  // `staged:` id was already counted in usoStorage while it sat in staging.
  if (tamanoDe(subidas.fotos, subidas.miniaturas) > espacioDisponible(coupleId)) {
    res.status(413).json({ error: ESPACIO_LLENO })
    return
  }
  const orden = ordenDe(req.body)
  const staged = leerStaged(orden, coupleId)
  if (!staged) {
    res.status(400).json({ error: 'Algunas fotos expiraron, volvé a agregarlas' })
    return
  }
  const archivos = await guardarArchivos(subidas.fotos, subidas.miniaturas, campos.cifrado)
  const id = randomUUID()
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.insertEntry.run(id, coupleId, campos.fecha, campos.fechaFin, campos.nota, fondo, req.userId!, ahora, campos.cifrado)
    // A client that sent files without an order gets them in upload order.
    if (orden.length === 0) {
      archivos.forEach((par, i) =>
        q.insertPhoto.run(randomUUID(), id, i, par.archivo, par.min, par.bytes, ahora, par.cifrado),
      )
    } else {
      colocarFotos(id, orden, archivos, staged, ahora)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    await almacen.borrar(archivos.flatMap((p) => (p.min ? [p.archivo, p.min] : [p.archivo])))
    throw e
  }
  res.status(201).json(entradaConFotos(q.entryById.get(id, coupleId) as FilaEntry))
})

/** Updates fields and rebuilds the photo list. `orden` is the final
 * sequence the user arranged: each item is either an existing photo id or
 * `nuevo:<n>` pointing at the n-th uploaded file, so a newly added photo
 * can sit anywhere — not just at the end. Photos left out are deleted. */
app.patch('/api/entries/:id', requireAuth, limiteSubida, camposSubida, async (req: AuthedRequest, res) => {
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
  if (tamanoDe(subidas.fotos, subidas.miniaturas) > espacioDisponible(coupleId)) {
    res.status(413).json({ error: ESPACIO_LLENO })
    return
  }
  const staged = leerStaged(orden, coupleId)
  if (!staged) {
    res.status(400).json({ error: 'Algunas fotos expiraron, volvé a agregarlas' })
    return
  }
  const archivos = await guardarArchivos(subidas.fotos, subidas.miniaturas, campos.cifrado)
  const ahora = new Date().toISOString()
  db.exec('BEGIN')
  try {
    q.updateEntry.run(campos.fecha, campos.fechaFin, campos.nota, campos.cifrado, entrada.id)
    eliminados.forEach((p) => q.deletePhoto.run(p.id))
    colocarFotos(entrada.id, orden, archivos, staged, ahora, (item, posicion) => {
      if (conservados.includes(item)) q.updatePhotoPos.run(posicion, item)
    })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    await almacen.borrar(archivos.flatMap((p) => (p.min ? [p.archivo, p.min] : [p.archivo])))
    throw e
  }
  // Only delete after the transaction committed, so a rollback can't leave
  // rows pointing at files that are already gone.
  await almacen.borrar(eliminados.flatMap(nombresDe))
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
  await almacen.borrar(fotos.flatMap(nombresDe))
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
  const cifrado = banderaCifrado(req)
  const texto = cifrado ? String(req.body?.texto ?? '') : String(req.body?.texto ?? '').trim()
  if (!texto) {
    res.status(400).json({ error: 'Escribí una idea' })
    return
  }
  if (texto.length > limiteTexto(MAX_LARGO_IDEA, cifrado)) {
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
  q.insertIdea.run(id, coupleId, texto, Number(maxpos ?? -1) + 1, new Date().toISOString(), cifrado)
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

// ── Inspiración: saved photo references, filed under the couple's own
// categories ─────────────────────────────────────────────────────────────

const MAX_CATEGORIAS = 20
const MAX_LARGO_CATEGORIA = 30
const MAX_INSPIRACIONES = 400
const MAX_LARGO_NOTA = 140

/** Categories and photos in one payload: the screen needs both to render,
 * and the lists are small enough that splitting them into two round trips
 * would only add a loading state. */
app.get('/api/inspiraciones', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const fotos = q.inspiracionesOfCouple.all(coupleId) as {
    id: string
    categoria_id: string | null
    nota: string | null
    es_video: number
    url_origen: string | null
    cifrado: number
  }[]
  res.json({
    categorias: q.categoriasOfCouple.all(coupleId),
    fotos: fotos.map((f) => ({
      id: f.id,
      categoriaId: f.categoria_id,
      nota: f.nota ?? undefined,
      esVideo: !!f.es_video,
      // Deliberately not encrypted, and worth being explicit about: the pin's
      // URL says what was saved from Pinterest. It is left readable because
      // "Ver en Pinterest" needs it, and it's listed among the leaks in
      // plan.md rather than being quietly overlooked.
      urlOrigen: f.url_origen ?? undefined,
      cifrado: !!Number(f.cifrado),
    })),
  })
})

function leerNombreCategoria(body: Record<string, unknown> | undefined, cifrado: 0 | 1): string | null {
  // Not trimmed when encrypted: base64 has no incidental whitespace, and
  // trimming ciphertext would corrupt it if it ever did.
  const nombre = cifrado ? String(body?.nombre ?? '') : String(body?.nombre ?? '').trim()
  if (!nombre || nombre.length > limiteTexto(MAX_LARGO_CATEGORIA, cifrado)) return null
  return nombre
}

app.post('/api/categorias', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const cifrado = banderaCifrado(req)
  const nombre = leerNombreCategoria(req.body, cifrado)
  if (!nombre) {
    res.status(400).json({ error: `Poné un nombre de hasta ${MAX_LARGO_CATEGORIA} caracteres` })
    return
  }
  const { n } = q.countCategorias.get(coupleId) as { n: number }
  if (Number(n) >= MAX_CATEGORIAS) {
    res.status(409).json({ error: `No podés tener más de ${MAX_CATEGORIAS} categorías` })
    return
  }
  const { maxpos } = q.maxPosCategoria.get(coupleId) as { maxpos: number | null }
  const id = randomUUID()
  q.insertCategoria.run(id, coupleId, nombre, Number(maxpos ?? -1) + 1, new Date().toISOString(), cifrado)
  res.status(201).json({ id, nombre })
})

/** Reorders the whole list at once: the client sends the final order it
 * arranged, so neither side has to work out how the other positions shifted.
 * Ids missing from `orden` keep their place after the ones listed. */
app.patch('/api/categorias', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const crudo = req.body?.orden
  const orden = (Array.isArray(crudo) ? crudo : []).map(String)
  if (orden.length === 0) {
    res.status(400).json({ error: 'Falta el orden' })
    return
  }

  // cifrado comes along so reordering can write it back untouched: this route
  // moves rows, it doesn't re-encrypt them, and dropping the flag here would
  // make the client try to read ciphertext as plain text.
  const actuales = q.categoriasOfCouple.all(coupleId) as { id: string; nombre: string; cifrado: number }[]
  const porId = new Map(actuales.map((c) => [c.id, c]))
  const ordenadas = orden.filter((id) => porId.has(id))
  const resto = actuales.filter((c) => !ordenadas.includes(c.id)).map((c) => c.id)

  db.exec('BEGIN')
  try {
    ;[...ordenadas, ...resto].forEach((id, i) => q.updateCategoria.run(porId.get(id)!.nombre, i, porId.get(id)!.cifrado, id, coupleId))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  res.json({ categorias: q.categoriasOfCouple.all(coupleId) })
})

app.patch('/api/categorias/:id', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const actuales = q.categoriasOfCouple.all(coupleId) as { id: string; nombre: string }[]
  const posicion = actuales.findIndex((c) => c.id === req.params.id)
  if (posicion === -1) {
    res.status(404).json({ error: 'No encontramos esa categoría' })
    return
  }
  const cifrado = banderaCifrado(req)
  const nombre = leerNombreCategoria(req.body, cifrado)
  if (!nombre) {
    res.status(400).json({ error: `Poné un nombre de hasta ${MAX_LARGO_CATEGORIA} caracteres` })
    return
  }
  // Position unchanged: renaming and reordering are separate operations.
  q.updateCategoria.run(nombre, posicion, cifrado, req.params.id, coupleId)
  res.json({ id: req.params.id, nombre })
})

/** The photos filed here survive — ON DELETE SET NULL drops them back to
 * "Sin categoría". Losing saved references because a label was renamed away
 * is not something the user could undo. */
app.delete('/api/categorias/:id', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const { changes } = q.deleteCategoria.run(req.params.id, coupleId)
  if (!Number(changes)) {
    res.status(404).json({ error: 'No encontramos esa categoría' })
    return
  }
  res.json({ ok: true })
})

/** Claims an already-uploaded photo into the board. Same row move the
 * recuerdos use: the bytes reached the disk through POST /api/photos, so
 * nothing is copied here. */
app.post('/api/inspiraciones', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }

  const stagedId = String(req.body?.stagedId ?? '').trim()
  if (!stagedId) {
    res.status(400).json({ error: 'Falta la foto' })
    return
  }
  const staged = q.stagedForCouple.get(stagedId, coupleId) as
    | { archivo: string; archivo_min: string | null; tam_bytes: number | null; cifrado: number }
    | undefined
  if (!staged) {
    // Swept after its day, or from another couple. Either way, failing beats
    // storing a row that points at nothing.
    res.status(400).json({ error: 'Esa foto ya no está disponible, probá de nuevo' })
    return
  }

  const categoriaId = req.body?.categoriaId ? String(req.body.categoriaId) : null
  if (categoriaId && !q.categoriaForCouple.get(categoriaId, coupleId)) {
    res.status(404).json({ error: 'No encontramos esa categoría' })
    return
  }

  // The photo's own flag comes from staging — it was already encrypted or not
  // when it was uploaded, and this route only files it. The nota is written
  // here, so it follows what the client says about *this* request.
  const cifrado = banderaCifrado(req)
  const nota = cifrado
    ? String(req.body?.nota ?? '').slice(0, limiteTexto(MAX_LARGO_NOTA, 1)) || null
    : String(req.body?.nota ?? '').trim().slice(0, MAX_LARGO_NOTA) || null

  // Only the client that just resolved a Pinterest link has any business
  // setting these, but there's no separate proof of that beyond the URL
  // shape itself — https-only keeps a stray value from ever becoming a
  // javascript: link when it's rendered as href later.
  const esVideo = req.body?.esVideo === true
  const urlOrigenCruda = typeof req.body?.urlOrigen === 'string' ? req.body.urlOrigen.trim() : ''
  const urlOrigen = /^https:\/\//.test(urlOrigenCruda) ? urlOrigenCruda.slice(0, 500) : null

  const { n } = q.countInspiraciones.get(coupleId) as { n: number }
  if (Number(n) >= MAX_INSPIRACIONES) {
    res.status(409).json({ error: `No podés guardar más de ${MAX_INSPIRACIONES} referencias` })
    return
  }

  const id = randomUUID()
  db.exec('BEGIN')
  try {
    q.insertInspiracion.run(
      id,
      coupleId,
      categoriaId,
      staged.archivo,
      staged.archivo_min,
      staged.tam_bytes,
      nota,
      esVideo ? 1 : 0,
      urlOrigen,
      new Date().toISOString(),
      // The bytes were already encrypted (or not) at upload time; only the
      // nota is decided by this request. They always agree in practice —
      // both come from the same client with the same key — and OR keeps the
      // row honest if they ever didn't.
      Number(staged.cifrado) || cifrado,
    )
    q.deleteStaged.run(stagedId)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  res.status(201).json({
    id,
    categoriaId,
    nota: nota ?? undefined,
    esVideo,
    urlOrigen: urlOrigen ?? undefined,
    cifrado: !!(Number(staged.cifrado) || cifrado),
  })
})

app.patch('/api/inspiraciones/:id', requireAuth, (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const categoriaId = req.body?.categoriaId ? String(req.body.categoriaId) : null
  if (categoriaId && !q.categoriaForCouple.get(categoriaId, coupleId)) {
    res.status(404).json({ error: 'No encontramos esa categoría' })
    return
  }
  const { changes } = q.moveInspiracion.run(categoriaId, req.params.id, coupleId)
  if (!Number(changes)) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  res.json({ id: req.params.id, categoriaId })
})

app.delete('/api/inspiraciones/:id', requireAuth, async (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'Todavía no estás en una pareja' })
    return
  }
  const foto = q.inspiracionForCouple.get(req.params.id, coupleId) as
    | { archivo: string; archivo_min: string | null }
    | undefined
  if (!foto) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  q.deleteInspiracion.run(req.params.id, coupleId)
  // Files after the row, so a failure here leaves an orphan in the store rather
  // than a row pointing at a photo that is gone.
  await almacen.borrar(nombresDe(foto))
  res.json({ ok: true })
})

/** Hosts this server will fetch on a caller's behalf. Handing the server a
 * URL to go get is an SSRF primitive — without a list it would happily read
 * `http://169.254.169.254/` or anything else on the box's own network — so
 * the list is the feature's boundary, not a nicety. Sharing from anywhere
 * else lands as a plain link, which is what the share sheet already gives us
 * when there's nothing to resolve. */
const HOSTS_ENLACE = new Set(['pin.it', 'i.pinimg.com'])

/** Pinterest serves a pin from a per-country subdomain — br, mx, py, co —
 * and the link someone copies carries whichever one their app is on. The
 * list used to name ar and es by hand, so a Brazilian pasting a Brazilian
 * link was told it couldn't be opened.
 *
 * This is an SSRF guard, so it stays anchored at both ends and the prefix is
 * exactly two letters or `www`: `evil-pinterest.com` and
 * `pinterest.com.attacker.net` both fail to match. */
const SUBDOMINIO_PINTEREST = /^([a-z]{2}\.|www\.)?pinterest\.com$/

/** Pinterest shares a pin as a link, never as a file, so the image has to be
 * looked up from the page. Every size of a pin lives at the same path with a
 * different segment — /736x/ab/cd/ef/hash.jpg — so the one the page
 * advertises can be traded up for a bigger one. */
const TAMANOS_PINIMG = ['originals', '1200x']

const MAX_BYTES_ENLACE = 12 * 1024 * 1024

function hostPermitido(u: string): URL | null {
  let url: URL
  try {
    url = new URL(u)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  return HOSTS_ENLACE.has(url.hostname) || SUBDOMINIO_PINTEREST.test(url.hostname) ? url : null
}

/** Attribute order isn't fixed — Pinterest emits `content` before
 * `property` — so match the tag first and read the attribute after. */
function imagenDeOpenGraph(html: string): string | null {
  for (const m of html.matchAll(/<meta[^>]*>/gi)) {
    if (!/property=["']og:image["']/i.test(m[0])) continue
    const contenido = /content=["']([^"']+)["']/i.exec(m[0])
    if (contenido) return contenido[1]
  }
  return null
}

function textoDeOpenGraph(html: string, propiedad: string): string | null {
  for (const m of html.matchAll(/<meta[^>]*>/gi)) {
    if (!new RegExp(`property=["']og:${propiedad}["']`, 'i').test(m[0])) continue
    const contenido = /content=["']([^"']+)["']/i.exec(m[0])
    if (contenido) return contenido[1]
  }
  return null
}

/** A video pin still carries an og:image — Pinterest points it at the cover
 * frame, never at og:video — so imagenDeOpenGraph resolves one either way and
 * a video lands here silently as a still. This is the one marker that tells
 * the two apart: Pinterest's own video schema block, present only on a pin
 * that has a clip behind it. */
function esPinDeVideo(html: string): boolean {
  return /data-test-id=["']video-snippet["']/i.test(html)
}

/** Bytes plus the content type, or null if this URL doesn't lead anywhere
 * usable. Tries the larger sizes first and settles for what the page said. */
async function bajarImagen(url: string): Promise<{ bytes: Buffer; tipo: string } | null> {
  const candidatos = [url]
  const pinimg = /^https:\/\/i\.pinimg\.com\/([^/]+)\/(.+)$/.exec(url)
  if (pinimg) candidatos.unshift(...TAMANOS_PINIMG.map((t) => `https://i.pinimg.com/${t}/${pinimg[2]}`))

  for (const candidato of candidatos) {
    if (!hostPermitido(candidato)) continue
    const r = await fetch(candidato, { redirect: 'follow' })
    if (!r.ok) continue
    const tipo = r.headers.get('content-type') ?? ''
    if (!tipo.startsWith('image/')) continue
    const largo = Number(r.headers.get('content-length') ?? 0)
    if (largo > MAX_BYTES_ENLACE) continue
    const bytes = Buffer.from(await r.arrayBuffer())
    // Checked again after the fact: content-length is a claim, not a promise.
    if (bytes.length > MAX_BYTES_ENLACE) continue
    return { bytes, tipo }
  }
  return null
}

/** Turns a shared link into the image behind it. Pinterest's share sheet
 * hands over a URL rather than a file, so without this a shared pin arrives
 * as nothing at all. The browser can't do this itself: i.pinimg.com sends no
 * CORS headers, so the fetch has to happen here.
 *
 * Answers with the raw bytes rather than JSON so the client can wrap them in
 * a File and push them through the same pipeline as a photo picked from the
 * gallery — downscale, thumbnail, staging. Nothing downstream needs to know
 * a pin was involved. */
app.get('/api/enlace/imagen', requireAuth, limiteEnlace, async (req: AuthedRequest, res) => {
  const pedido = hostPermitido(String(req.query.url ?? ''))
  if (!pedido) {
    res.status(400).json({ error: 'Ese enlace no se puede abrir desde acá' })
    return
  }

  const pagina = await fetch(pedido.href, { redirect: 'follow' })
  // The short link (pin.it) redirects into the site proper; make sure it
  // didn't redirect somewhere off the list on the way.
  if (!pagina.ok || !hostPermitido(pagina.url)) {
    res.status(404).json({ error: 'No pudimos leer ese enlace' })
    return
  }

  const html = await pagina.text()
  const origen = imagenDeOpenGraph(html)
  if (!origen) {
    res.status(404).json({ error: 'No encontramos ninguna imagen en ese enlace' })
    return
  }

  const imagen = await bajarImagen(origen)
  if (!imagen) {
    res.status(404).json({ error: 'No pudimos descargar esa imagen' })
    return
  }

  // The title rides along in a header so the client can offer it as the note
  // without a second request. Encoded because headers are latin-1 and pin
  // titles are not.
  const titulo = textoDeOpenGraph(html, 'title')
  if (titulo) res.setHeader('X-Titulo', encodeURIComponent(titulo))
  res.setHeader('X-Es-Video', esPinDeVideo(html) ? '1' : '0')
  res.setHeader('Content-Type', imagen.tipo)
  res.send(imagen.bytes)
})

/** Just what the link *is*, without downloading the picture behind it.
 *
 * The share sheet doesn't always send a link on its own: sharing a video pin
 * hands over a cover image as a file *and* the link, and in that case the
 * bytes are already on the phone — only the pin's nature is missing. Asking
 * /enlace/imagen for that would re-download a picture we already have. */
app.get('/api/enlace/info', requireAuth, limiteEnlace, async (req: AuthedRequest, res) => {
  const pedido = hostPermitido(String(req.query.url ?? ''))
  if (!pedido) {
    res.status(400).json({ error: 'Ese enlace no se puede abrir desde acá' })
    return
  }

  const pagina = await fetch(pedido.href, { redirect: 'follow' })
  if (!pagina.ok || !hostPermitido(pagina.url)) {
    res.status(404).json({ error: 'No pudimos leer ese enlace' })
    return
  }

  const html = await pagina.text()
  res.json({ esVideo: esPinDeVideo(html), titulo: textoDeOpenGraph(html, 'title') ?? undefined })
})

/** Photo files. Cookie-authenticated so <img> works, and scoped to the
 * caller's couple so a leaked id is useless to anyone else.
 *
 * `?tamano=min` serves the 800px copy the timeline grid needs. Photos
 * uploaded before thumbnails existed have none, so they fall back to the
 * full file — a slow photo beats a broken one. */
app.get('/api/photos/:id', requireCookie, async (req: AuthedRequest, res) => {
  const coupleId = coupleIdDe(req.userId!)
  if (!coupleId) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  // Recuerdo photos and saved references share this route and so share one
  // URL shape on the client. Both lookups are scoped to the couple, so an id
  // from anywhere else resolves to nothing either way.
  const foto = (q.photoForCouple.get(req.params.id, coupleId) ??
    q.inspiracionForCouple.get(req.params.id, coupleId)) as
    | { archivo: string; archivo_min: string | null; cifrado: number }
    | undefined
  if (!foto) {
    res.status(404).json({ error: 'No encontramos esa foto' })
    return
  }
  const cifrada = !!Number(foto.cifrado)
  const archivo = req.query.tamano === 'min' && foto.archivo_min ? foto.archivo_min : foto.archivo
  // Fetched before any header goes out: with the bytes possibly coming from
  // R2, "the row exists but the object doesn't" is a real case, and it has
  // to end as a clean 404 rather than a truncated image.
  const cuerpo = await almacen.leer(archivo)
  if (!cuerpo) {
    res.sendStatus(404)
    return
  }
  // Told, not guessed: the service worker decides whether to decrypt from
  // this header, and it is the server that knows. Encrypted bytes are also
  // declared as what they are — if the SW is missing or still installing, an
  // honest octet-stream fails visibly instead of an <img> silently rendering
  // ciphertext as a broken WebP.
  res.setHeader('X-Cifrado', cifrada ? '1' : '0')
  res.setHeader('Content-Type', cifrada ? 'application/octet-stream' : 'image/webp')
  // Lets the SW's decrypted response be told apart from this one in any cache
  // that sits between them.
  res.setHeader('Vary', 'X-Cifrado')
  // Filenames are random and never reused, so the bytes behind an id never
  // change — but keep it private so no shared cache holds onto them. With
  // R2 this also stops being a nicety: every uncached view is a Class B
  // operation the couple's own browser could have avoided.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  // The stream can still break mid-flight — a dropped connection to R2, a
  // read error on disk. Headers are already gone by then, so all that's left
  // is to stop rather than leave the socket hanging.
  cuerpo.on('error', (e) => {
    console.error(`falló el envío de ${archivo}:`, e)
    res.destroy()
  })
  cuerpo.pipe(res)
})

/** Multer rejects an upload before the route ever runs. Those are the
 * client's fault, not ours, so they get a 400 the user can act on — a bare
 * "Error interno" gives no hint that the fix is sending fewer photos. */
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

await backfillTamanos()

app.listen(PORT, '127.0.0.1', () => {
  console.log(`duette-server escuchando en 127.0.0.1:${PORT}`)
})
