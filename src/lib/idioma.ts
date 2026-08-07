import { useCallback, useMemo, useState } from 'react'
import { crearT, resolverIdioma, type FuncionT, type Idioma, type IdiomaResuelto } from './i18n'
import { DICCIONARIOS } from './i18n/diccionarios'

const CLAVE = 'duette-idioma'

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
