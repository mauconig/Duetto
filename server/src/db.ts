import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DB_PATH = process.env.DUETTE_DB_PATH ?? './data/duette.db'

mkdirSync(dirname(DB_PATH), { recursive: true })

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
    proximo_hito      TEXT
  );

  CREATE TABLE IF NOT EXISTS members (
    user_id    TEXT PRIMARY KEY,
    couple_id  TEXT NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    nombre     TEXT NOT NULL,
    joined_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_couple ON members(couple_id);
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
