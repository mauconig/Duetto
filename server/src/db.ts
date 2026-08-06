import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DB_PATH = process.env.DUETTE_DB_PATH ?? './data/duette.db'

/** Where photo files live. Kept beside the database so one backup covers
 * both, and never inside the repo. */
export const UPLOADS_DIR = process.env.DUETTE_UPLOADS_DIR ?? join(dirname(DB_PATH), 'uploads')

mkdirSync(dirname(DB_PATH), { recursive: true })
mkdirSync(UPLOADS_DIR, { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- The anniversary and milestone live on the couple, not on each member:
  -- they're the same for both, so whoever joins second inherits them
  -- instead of being asked again.
  CREATE TABLE IF NOT EXISTS couples (
    id                TEXT PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    created_at        TEXT NOT NULL,
    fecha_aniversario TEXT,
    proximo_hito      TEXT,
    ideas_sembradas   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS members (
    user_id    TEXT PRIMARY KEY,
    couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    joined_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_couple ON members(couple_id);

  CREATE TABLE IF NOT EXISTS entries (
    id         TEXT PRIMARY KEY,
    couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    fecha      TEXT NOT NULL,
    fecha_fin  TEXT,
    nota       TEXT,
    fondo      TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- archivo is the full 2500px version, archivo_min an 800px copy for the
  -- timeline grid. Null on photos uploaded before thumbnails existed, which
  -- fall back to the full file.
  CREATE TABLE IF NOT EXISTS photos (
    id           TEXT PRIMARY KEY,
    entry_id     TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    posicion     INTEGER NOT NULL,
    archivo      TEXT NOT NULL,
    archivo_min  TEXT,
    created_at   TEXT NOT NULL
  );

  -- Photos already uploaded but not yet attached to an entry. The sheet
  -- sends each one as soon as it's downscaled, so the bytes are already
  -- here by the time the recuerdo is saved. A row moves into photos when
  -- the entry is created; whatever is left over gets swept after a day.
  CREATE TABLE IF NOT EXISTS staged_photos (
    id          TEXT PRIMARY KEY,
    couple_id   TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    archivo     TEXT NOT NULL,
    archivo_min TEXT,
    created_at  TEXT NOT NULL
  );

  -- Roulette ideas belong to the couple, like everything else here: both
  -- partners add to the same wheel and spin the same list.
  CREATE TABLE IF NOT EXISTS ideas (
    id         TEXT PRIMARY KEY,
    couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    texto      TEXT NOT NULL,
    posicion   INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_entries_couple ON entries(couple_id);
  CREATE INDEX IF NOT EXISTS idx_photos_entry ON photos(entry_id);
  CREATE INDEX IF NOT EXISTS idx_staged_couple ON staged_photos(couple_id);
  CREATE INDEX IF NOT EXISTS idx_ideas_couple ON ideas(couple_id);
`)

/** Adds a column to an existing table if it isn't there yet, so a database
 * created by an earlier version picks up new fields on restart. */
function addColumnIfMissing(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

addColumnIfMissing('couples', 'fecha_aniversario', 'TEXT')
addColumnIfMissing('couples', 'proximo_hito', 'TEXT')
addColumnIfMissing('couples', 'ideas_sembradas', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('photos', 'archivo_min', 'TEXT')

/** What the wheel used to be hardcoded with on the client. */
const IDEAS_INICIALES = [
  'Picnic al atardecer',
  'Noche de cocina italiana',
  'Cine en casa',
  'Ruta de cafés nuevos',
  'Museo sorpresa',
  'Caminata al amanecer',
]

/** Gives a couple a wheel that already has something on it. The flag makes
 * this happen exactly once, so a couple that deletes every idea keeps an
 * empty wheel instead of watching the defaults grow back. */
export function sembrarIdeas(coupleId: string) {
  const insert = db.prepare('INSERT INTO ideas (id, couple_id, texto, posicion, created_at) VALUES (?, ?, ?, ?, ?)')
  const ahora = new Date().toISOString()
  IDEAS_INICIALES.forEach((texto, i) => insert.run(randomUUID(), coupleId, texto, i, ahora))
  db.prepare('UPDATE couples SET ideas_sembradas = 1 WHERE id = ?').run(coupleId)
}

// Couples that predate the shared roulette get the same six ideas on the
// first boot after this ships.
for (const fila of db.prepare('SELECT id FROM couples WHERE ideas_sembradas = 0').all() as { id: string }[]) {
  sembrarIdeas(fila.id)
}

/** Unambiguous alphabet: no O/0, I/1/L — these get misread when a code
 * is dictated out loud or copied off a screen. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function generateCode(): string {
  const find = db.prepare('SELECT 1 FROM couples WHERE code = ?')
  for (let intento = 0; intento < 50; intento++) {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
    if (!find.get(code)) return code
  }
  throw new Error('No se pudo generar un código libre')
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
