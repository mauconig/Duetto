import { useCallback, useMemo, useState } from 'react'
import { crearT, resolverIdioma, type ClaveTexto, type FuncionT, type Idioma, type IdiomaResuelto } from './i18n'
import { DICCIONARIOS } from './i18n/diccionarios'

const CLAVE = 'duette-idioma'

/** What the picker offers, wherever it appears (Perfil, Bienvenida). No
 * `auto` entry: it's still the default for someone who hasn't chosen yet
 * (see `leerPreferencia` below), but it isn't a button — a wrong guess gets
 * fixed by tapping the right language, not by round-tripping through a mode
 * called "Auto". */
export const OPCIONES_IDIOMA: { valor: IdiomaResuelto; clave: ClaveTexto }[] = [
  { valor: 'es', clave: 'perfil_idioma_es' },
  { valor: 'en', clave: 'perfil_idioma_en' },
  { valor: 'pt', clave: 'perfil_idioma_pt' },
]

function leerPreferencia(): Idioma {
  const guardado = localStorage.getItem(CLAVE)
  return guardado === 'es' || guardado === 'en' || guardado === 'pt' ? guardado : 'auto'
}

/** Same shape as useTema: a stored preference, `auto` as the default that
 * resolves against something outside our control (the OS there, the
 * browser's own language here), and a setter that clears the key rather
 * than writing 'auto' so a browser language change is picked up again. */
export function useIdioma() {
  const [idioma, setIdiomaEstado] = useState<Idioma>(leerPreferencia)
  const resuelto: IdiomaResuelto = useMemo(() => resolverIdioma(idioma), [idioma])
  const t: FuncionT = useMemo(() => crearT(DICCIONARIOS[resuelto]), [resuelto])

  const setIdioma = useCallback((nuevo: Idioma) => {
    if (nuevo === 'auto') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, nuevo)
    setIdiomaEstado(nuevo)
  }, [])

  return { idioma, setIdioma, resuelto, t }
}
