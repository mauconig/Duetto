import { createContext, useContext, type ReactNode } from 'react'
import { useIdioma } from '../idioma'
import type { FuncionT, Idioma, IdiomaResuelto } from './index'

interface ContextoIdioma {
  idioma: Idioma
  setIdioma: (i: Idioma) => void
  resuelto: IdiomaResuelto
  t: FuncionT
}

const Contexto = createContext<ContextoIdioma | null>(null)

/** One instance of useIdioma for the whole app, so a change from Perfil
 * reaches Inicio without a prop threaded through every screen — the
 * alternative to a context here is `t` as a parameter on every single
 * component, leaf ones included, which is worse than the context it would
 * be avoiding. */
export function IdiomaProvider({ children }: { children: ReactNode }) {
  const valor = useIdioma()
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** What almost every component needs: the translated string for a key. */
export function useT(): FuncionT {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useT() fuera de <IdiomaProvider>')
  return ctx.t
}

/** For the few callers that also need to know or change which language is
 * active — the picker in Perfil, date formatting that can't go through `t`
 * because it needs the resolved language rather than one string. */
export function useIdiomaContexto(): ContextoIdioma {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useIdiomaContexto() fuera de <IdiomaProvider>')
  return ctx
}
