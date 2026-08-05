const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export const pad = (n: number) => String(Math.max(n, 0)).padStart(2, '0')

export function parseFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatFecha(f: Date): string {
  return `${f.getDate()} ${MESES[f.getMonth()]} ${f.getFullYear()}`
}

export function formatFechaHoy(hoy: Date): string {
  return `${DIAS[hoy.getDay()]}, ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`
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

export interface Hito {
  titulo: string
  diasNum: number
  diasLabel: string
  progreso: string
}

export function calcularHito(hoy: Date, ini: Date, tipo: 'cumplemes' | 'aniversario'): Hito {
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  let prox: Date
  let titulo: string
  let totalTramo: number

  if (tipo === 'aniversario') {
    prox = new Date(hoy.getFullYear(), ini.getMonth(), ini.getDate())
    if (prox <= hoy0) prox = new Date(hoy.getFullYear() + 1, ini.getMonth(), ini.getDate())
    titulo = `Aniversario n.º ${prox.getFullYear() - ini.getFullYear()}`
    totalTramo = 365
  } else {
    prox = new Date(hoy.getFullYear(), hoy.getMonth(), ini.getDate())
    if (prox <= hoy0) prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, ini.getDate())
    titulo = `Cumplemes n.º ${(prox.getFullYear() - ini.getFullYear()) * 12 + (prox.getMonth() - ini.getMonth())}`
    totalTramo = 30
  }

  const diasNum = Math.round((prox.getTime() - hoy0.getTime()) / 864e5)
  const progreso = Math.round(Math.min(Math.max(1 - diasNum / totalTramo, 0.04), 1) * 100) + '%'

  return { titulo, diasNum, diasLabel: diasNum === 1 ? 'día' : 'días', progreso }
}

export function diasJuntos(hoy: Date, ini: Date): number {
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(Math.floor((hoy0.getTime() - ini.getTime()) / 864e5), 0)
}

export const RULETA_COLORES = ['#b03246', '#f0c7ca', '#8c2b3c', '#e59da3', '#a32f42', '#f9e6e6']
export const RULETA_TEXTO = ['#fff', '#8a2333', '#fff', '#8a2333', '#fff', '#8a2333']

export function ruedaFondo(ideas: string[]): string {
  if (!ideas.length) return '#f4d9db'
  const seg = 360 / ideas.length
  const stops = ideas.map((_, i) => `${RULETA_COLORES[i % 6]} ${i * seg}deg ${(i + 1) * seg}deg`)
  return `conic-gradient(from 0deg, ${stops.join(', ')})`
}

export function truncarEtiqueta(t: string): string {
  return t.length > 17 ? t.slice(0, 16) + '…' : t
}
