import { useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/react'
import type { Album } from '../types'

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

  /** Same auth, but the browser sets the multipart Content-Type (with its
   * boundary) — setting it by hand breaks the upload. */
  const enviarFormulario = useCallback(
    async <T,>(path: string, method: string, form: FormData): Promise<T> => {
      const token = await getToken()
      const res = await fetch(`/api${path}`, {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) throw new ApiError(cuerpo?.error ?? 'Algo salió mal', res.status)
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

      /** Sets the cookie that photo <img> requests authenticate with. */
      iniciarSesionFotos() {
        return call<{ ok: boolean }>('/session', { method: 'POST' })
      },

      obtenerEntradas() {
        return call<Album[]>('/entries')
      },

      crearEntrada(datos: DatosEntrada) {
        return enviarFormulario<Album>('/entries', 'POST', armarFormulario(datos))
      },

      editarEntrada(id: string, datos: DatosEntrada) {
        return enviarFormulario<Album>(`/entries/${id}`, 'PATCH', armarFormulario(datos))
      },
    }),
    [call, enviarFormulario],
  )
}

export interface DatosEntrada {
  fecha: string
  fechaFin?: string
  nota?: string
  fondo: string
  /** Final photo order: an existing photo id, or `nuevo:<n>` pointing at
   * the n-th blob in `fotosNuevas`. Existing ids left out get deleted. */
  orden?: string[]
  fotosNuevas: Blob[]
}

function armarFormulario(datos: DatosEntrada): FormData {
  const form = new FormData()
  form.append('fecha', datos.fecha)
  form.append('fechaFin', datos.fechaFin ?? '')
  form.append('nota', datos.nota ?? '')
  form.append('fondo', datos.fondo)
  for (const item of datos.orden ?? []) form.append('orden', item)
  datos.fotosNuevas.forEach((blob, i) => form.append('fotos', blob, `foto-${i}.webp`))
  return form
}
