import { es } from './es'
import { en } from './en'
import { pt } from './pt'
import type { Diccionario, IdiomaResuelto } from './index'

export const DICCIONARIOS: Record<IdiomaResuelto, Diccionario> = { es, en, pt }
