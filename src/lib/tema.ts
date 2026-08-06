import { useCallback, useEffect, useState } from 'react'

export type Tema = 'auto' | 'claro' | 'oscuro'

const CLAVE = 'duette-tema'

function leerPreferencia(): Tema {
  const guardado = localStorage.getItem(CLAVE)
  return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'auto'
}

function sistemaEsOscuro(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function aplicar(tema: Tema): boolean {
  const oscuro = tema === 'auto' ? sistemaEsOscuro() : tema === 'oscuro'
  document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
  return oscuro
}

/** Applied before React mounts so the first paint is already the right
 * colour — otherwise a dark-mode user gets a white flash on every load. */
export function iniciarTema() {
  aplicar(leerPreferencia())
}

export function useTema() {
  const [tema, setTemaEstado] = useState<Tema>(leerPreferencia)
  const [esOscuro, setEsOscuro] = useState(() => aplicar(leerPreferencia()))

  const setTema = useCallback((nuevo: Tema) => {
    if (nuevo === 'auto') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, nuevo)
    setTemaEstado(nuevo)
    setEsOscuro(aplicar(nuevo))
  }, [])

  // Follow the OS while on 'auto', so switching the phone to night mode
  // changes the app without reopening it.
  useEffect(() => {
    if (tema !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => setEsOscuro(aplicar('auto'))
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [tema])

  return { tema, setTema, esOscuro }
}
