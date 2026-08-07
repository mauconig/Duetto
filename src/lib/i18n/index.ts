import { es } from './es'

/** The shape every language has to match. `en` and `pt` are declared as
 * `Diccionario`, so TypeScript checks every key exists with the exact same
 * signature — a string stays a string, a function keeps its parameters.
 * Miss one and the build fails instead of shipping a blank or a Spanish
 * leftover to someone reading English. */
export type Diccionario = typeof es

export type ClaveTexto = keyof Diccionario

/** What the picker in Perfil offers, and what gets saved. `auto` isn't a
 * language — it's resolved below, the same way `tema.ts` resolves `auto` to
 * light or dark. */
export type Idioma = 'auto' | 'es' | 'en' | 'pt'
export type IdiomaResuelto = 'es' | 'en' | 'pt'

export const IDIOMAS_SOPORTADOS: IdiomaResuelto[] = ['es', 'en', 'pt']

/** `es` is the fallback both for a browser reporting some other language
 * entirely and for the couple this was actually built for, who are in
 * Paraguay. */
export function detectarIdioma(): IdiomaResuelto {
  const candidatos = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  for (const etiqueta of candidatos) {
    const base = etiqueta.slice(0, 2).toLowerCase()
    if ((IDIOMAS_SOPORTADOS as string[]).includes(base)) return base as IdiomaResuelto
  }
  return 'es'
}

export function resolverIdioma(idioma: Idioma): IdiomaResuelto {
  return idioma === 'auto' ? detectarIdioma() : idioma
}

/** Extracts the argument list a dictionary entry needs: none for a plain
 * string, whatever the function declares otherwise. This is what lets
 * `t('inicio_saludo', nombres)` type-check the second argument against the
 * specific key in the first. */
type Args<K extends ClaveTexto> = Diccionario[K] extends (...a: infer A) => string ? A : []

export type FuncionT = <K extends ClaveTexto>(clave: K, ...args: Args<K>) => string

/** Built once per resolved language — the dictionaries are static imports,
 * so there's no async loading to wait on and no flash of untranslated text. */
export function crearT(dic: Diccionario): FuncionT {
  return function t<K extends ClaveTexto>(clave: K, ...args: Args<K>): string {
    const valor = dic[clave]
    // The union of every entry's function type doesn't structurally overlap
    // with the one signature this specific K picks out, which is exactly
    // why the generic is worth having at the call site — but it means the
    // cast has to go through unknown here, where the invariant (this args
    // list matches this key) is true by construction rather than provable.
    return typeof valor === 'function' ? (valor as unknown as (...a: Args<K>) => string)(...args) : (valor as string)
  }
}
