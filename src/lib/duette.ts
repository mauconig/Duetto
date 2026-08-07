import type { Album } from '../types'
import { photoUrl } from './photoStorage'
import type { IdiomaResuelto } from './i18n'

/** Hand-rolled per language rather than `Intl.DateTimeFormat`: Intl's short
 * form adds a period after the month in Spanish and Portuguese ("7 ago.
 * 2026", "7 de ago. de 2026") that this app's compact badges never had, and
 * mixing that punctuation style with the plain one already in use would
 * read as inconsistent rather than as three languages. This keeps every
 * locale byte-for-byte predictable, the same reason the rest of the project
 * avoids letting a big dependency make small formatting decisions for it. */
const MESES: Record<IdiomaResuelto, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
}
const MESES_LARGOS: Record<IdiomaResuelto, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
}
const DIAS: Record<IdiomaResuelto, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  pt: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
}

export const pad = (n: number) => String(Math.max(n, 0)).padStart(2, '0')

export function parseFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatFecha(f: Date, idioma: IdiomaResuelto): string {
  return `${f.getDate()} ${MESES[idioma][f.getMonth()]} ${f.getFullYear()}`
}

/** English drops the "de": "Friday, August 7" reads right, "Friday, 7 of
 * August" doesn't. Spanish and Portuguese share the same "<día>, <n> de
 * <mes>" shape. */
export function formatFechaHoy(hoy: Date, idioma: IdiomaResuelto): string {
  if (idioma === 'en') return `${DIAS.en[hoy.getDay()]}, ${MESES_LARGOS.en[hoy.getMonth()]} ${hoy.getDate()}`
  return `${DIAS[idioma][hoy.getDay()]}, ${hoy.getDate()} de ${MESES_LARGOS[idioma][hoy.getMonth()]}`
}

export interface Edad {
  anios: number
  meses: number
  dias: number
}

export function calcularEdad(hoy: Date, ini: Date): Edad {
  let a = hoy.getFullYear() - ini.getFullYear()
  let m = hoy.getMonth() - ini.getMonth()
  let d = hoy.getDate() - ini.getDate()
  if (d < 0) {
    m--
    d += new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate()
  }
  if (m < 0) {
    a--
    m += 12
  }
  return { anios: a, meses: m, dias: d }
}

/** Neither this nor `HitoDeHoy` carries a title string: "Aniversario n.º 3"
 * is Spanish text, and this file doesn't know what language is active — nor
 * should it, it's date arithmetic. `tipo` and `numero` are what the caller
 * needs to build the title with `t()`. */
export interface Hito {
  tipo: 'cumplemes' | 'aniversario'
  numero: number
  diasNum: number
  progreso: string
}

export interface HitoDeHoy {
  tipo: 'cumplemes' | 'aniversario'
  /** Identifies the milestone itself, not the date, so the celebration can
   * be shown once and not again on every app open that day. */
  clave: string
  numero: number
}

/** A couple that started on the 31st still has a cumplemes in April, and one
 * that started on Feb 29 still has an anniversary in ordinary years. Clamp to
 * the last day of the month instead of letting the date roll into the next
 * one, which is what `new Date(y, m, 31)` quietly does. */
function diaEnMes(mes: Date, dia: number): number {
  return Math.min(dia, new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate())
}

/** The milestone that lands today, or null on every other day.
 *
 * `calcularHito` looks forward on purpose, and on the day itself it is
 * already pointing at the next one — the card goes from "faltan 1 día"
 * straight to "faltan 365". So the one day that's worth something was the
 * one day the app had no way to name. */
export function hitoDeHoy(hoy: Date, ini: Date, tipo: 'cumplemes' | 'aniversario'): HitoDeHoy | null {
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const ini0 = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate())
  // The first day isn't an anniversary of anything yet.
  if (hoy0 <= ini0) return null
  if (hoy0.getDate() !== diaEnMes(hoy0, ini0.getDate())) return null

  if (tipo === 'aniversario') {
    if (hoy0.getMonth() !== ini0.getMonth()) return null
    const numero = hoy0.getFullYear() - ini0.getFullYear()
    return { tipo, clave: `aniversario-${numero}`, numero }
  }
  const numero = (hoy0.getFullYear() - ini0.getFullYear()) * 12 + (hoy0.getMonth() - ini0.getMonth())
  return { tipo, clave: `cumplemes-${numero}`, numero }
}

export function calcularHito(hoy: Date, ini: Date, tipo: 'cumplemes' | 'aniversario'): Hito {
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  let prox: Date
  let numero: number
  let totalTramo: number

  if (tipo === 'aniversario') {
    prox = new Date(hoy.getFullYear(), ini.getMonth(), ini.getDate())
    if (prox <= hoy0) prox = new Date(hoy.getFullYear() + 1, ini.getMonth(), ini.getDate())
    numero = prox.getFullYear() - ini.getFullYear()
    totalTramo = 365
  } else {
    prox = new Date(hoy.getFullYear(), hoy.getMonth(), ini.getDate())
    if (prox <= hoy0) prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, ini.getDate())
    numero = (prox.getFullYear() - ini.getFullYear()) * 12 + (prox.getMonth() - ini.getMonth())
    totalTramo = 30
  }

  const diasNum = Math.round((prox.getTime() - hoy0.getTime()) / 864e5)
  const progreso = Math.round(Math.min(Math.max(1 - diasNum / totalTramo, 0.04), 1) * 100) + '%'

  return { tipo, numero, diasNum, progreso }
}

export function diasJuntos(hoy: Date, ini: Date): number {
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(Math.floor((hoy0.getTime() - ini.getTime()) / 864e5), 0)
}

export const RULETA_COLORES = ['#b03246', '#f0c7ca', '#8c2b3c', '#e59da3', '#a32f42', '#f9e6e6']
export const RULETA_TEXTO = ['#fff', '#8a2333', '#fff', '#8a2333', '#fff', '#8a2333']

export function ruedaFondo(cantidad: number): string {
  if (cantidad < 1) return '#f4d9db'
  const seg = 360 / cantidad
  const stops = Array.from({ length: cantidad }, (_, i) => `${RULETA_COLORES[i % 6]} ${i * seg}deg ${(i + 1) * seg}deg`)
  return `conic-gradient(from 0deg, ${stops.join(', ')})`
}

export function truncarEtiqueta(t: string): string {
  return t.length > 17 ? t.slice(0, 16) + '…' : t
}

/** Stable-for-the-day pick, seeded by day-of-year, so it doesn't
 * re-randomize on every render/navigation within the same day. */
export function pickDaily<T>(list: T[], hoy: Date): T | null {
  if (!list.length) return null
  const dayIndex = Math.floor(hoy.getTime() / 864e5)
  return list[dayIndex % list.length]
}

export function sortByFecha(albumes: Album[]): Album[] {
  return [...albumes].sort((a, b) => parseFecha(a.fecha).getTime() - parseFecha(b.fecha).getTime())
}

export function formatFechaEntrada(album: Album, idioma: IdiomaResuelto): string {
  const inicio = formatFecha(parseFecha(album.fecha), idioma)
  if (!album.fechaFin) return inicio
  return `${inicio} – ${formatFecha(parseFecha(album.fechaFin), idioma)}`
}

const FONDOS = [
  'linear-gradient(135deg, #cf6a78, #a32f42)',
  'linear-gradient(135deg, #a8465c, #6d1f30)',
  'linear-gradient(135deg, #e0a08a, #c26550)',
  'linear-gradient(135deg, #d98b78, #b0503c)',
]

export function randomFondo(): string {
  return FONDOS[Math.floor(Math.random() * FONDOS.length)]
}

export interface PhotoSlot {
  id: string
  /** Full size — only the lightbox should load this. */
  src?: string
  /** 800px copy for the timeline grid. */
  miniatura?: string
  /** True when the moodboard slot was saved from a Pinterest *video* pin —
   * the file is still just its cover frame. Informational only. */
  esVideo?: boolean
  /** Where the pin this slot was saved from lives, set on any moodboard slot
   * that came from Pinterest — photo pin or video pin alike. This is what
   * tells the lightbox to offer "Ver en Pinterest". */
  urlOrigen?: string | null
}

export function photoSlots(album: Album): PhotoSlot[] {
  return album.fotoIds.map((id) => ({ id, src: photoUrl(id), miniatura: photoUrl(id, 'miniatura') }))
}
