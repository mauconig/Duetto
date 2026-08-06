import { useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/react'
import type { Album } from '../types'
import type { FotoProcesada } from './photoStorage'

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

/** One slice of the roulette. Shared by the couple, so it needs an id the
 * partner's client can refer to as well. */
export interface Idea {
  id: string
  texto: string
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
      /** Any subset of the fields; omitted ones are left untouched. */
      guardarPerfil(cambios: { fechaAniversario?: string; proximoHito?: Pareja['proximoHito']; nombre?: string }) {
        return call<Pareja>('/couple', { method: 'PATCH', body: JSON.stringify(cambios) })
      },

      /** Leaves the couple. `parejaBorrada` tells whether the couple itself
       * was removed (nobody left in it) or the partner kept it. */
      salirDePareja() {
        return call<{ ok: boolean; parejaBorrada: boolean }>('/couple/me', { method: 'DELETE' })
      },

      /** Sets the cookie that photo <img> requests authenticate with. */
      iniciarSesionFotos() {
        return call<{ ok: boolean }>('/session', { method: 'POST' })
      },

      obtenerEntradas() {
        return call<Album[]>('/entries')
      },

      /** Uploads one downscaled photo and returns the id that `orden` refers
       * to it by. The sheet calls this as each photo finishes, so saving the
       * recuerdo afterwards carries no files at all. */
      async subirFoto(foto: FotoProcesada): Promise<string> {
        const form = new FormData()
        form.append('foto', foto.completa, 'foto.webp')
        form.append('miniatura', foto.miniatura, 'min.webp')
        const { id } = await enviarFormulario<{ id: string }>('/photos', 'POST', form)
        return id
      },

      crearEntrada(datos: DatosEntrada) {
        return call<Album>('/entries', { method: 'POST', body: JSON.stringify(datos) })
      },

      editarEntrada(id: string, datos: DatosEntrada) {
        return call<Album>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(datos) })
      },

      borrarEntrada(id: string) {
        return call<{ ok: boolean }>(`/entries/${id}`, { method: 'DELETE' })
      },

      obtenerIdeas() {
        return call<Idea[]>('/ideas')
      },

      agregarIdea(texto: string) {
        return call<Idea>('/ideas', { method: 'POST', body: JSON.stringify({ texto }) })
      },

      borrarIdea(id: string) {
        return call<{ ok: boolean }>(`/ideas/${id}`, { method: 'DELETE' })
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
  /** Final photo order: an existing photo id, or `staged:<id>` pointing at a
   * photo already uploaded through subirFoto. Existing ids left out get
   * deleted, along with their files. */
  orden: string[]
}
