import { useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/react'

export interface Pareja {
  coupleId: string
  codigo: string
  nombrePropio: string | null
  nombrePareja: string | null
  fechaAniversario: string | null
  proximoHito: 'cumplemes' | 'aniversario' | null
  /** True once both partners are in — one person can still use the app
   * while waiting for the other to enter the code. */
  vinculada: boolean
}

/** Error carrying the HTTP status so callers can tell "no couple yet"
 * (404) apart from a real failure. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function useApi() {
  const { getToken } = useAuth()

  const call = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getToken()
      const res = await fetch(`/api${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init?.headers,
        },
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new ApiError(cuerpo?.error ?? 'Algo salió mal', res.status)
      }
      return cuerpo as T
    },
    [getToken],
  )

  return useMemo(
    () => ({
      /** Current couple, or null when the user hasn't created/joined one. */
      async obtenerPareja(): Promise<Pareja | null> {
        try {
          return await call<Pareja>('/couple')
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return null
          throw e
        }
      },
      crearPareja(nombre: string) {
        return call<Pareja>('/couple', { method: 'POST', body: JSON.stringify({ nombre }) })
      },
      unirsePareja(nombre: string, codigo: string) {
        return call<Pareja>('/couple/join', { method: 'POST', body: JSON.stringify({ nombre, codigo }) })
      },
      guardarPerfil(fechaAniversario: string, proximoHito: Pareja['proximoHito']) {
        return call<Pareja>('/couple', { method: 'PATCH', body: JSON.stringify({ fechaAniversario, proximoHito }) })
      },
    }),
    [call],
  )
}
