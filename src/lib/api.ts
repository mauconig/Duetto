import { useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/react'
import type { Album } from '../types'
import type { FotoProcesada } from './photoStorage'

/** Version of the privacy policy the consent tick refers to. Bump it here and
 * in `public/privacidad.html` together whenever the policy changes materially,
 * so the stored record says which text the person actually agreed to. */
export const VERSION_PRIVACIDAD = '1.0'

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

/** A category on the inspiración board, invented by the couple. */
export interface Categoria {
  id: string
  nombre: string
}

/** A saved photo reference. `categoriaId` is null for anything not filed
 * yet, or whose category was deleted out from under it. */
export interface Inspiracion {
  id: string
  categoriaId: string | null
  nota?: string
}

export interface Tablero {
  categorias: Categoria[]
  fotos: Inspiracion[]
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
        return call<Pareja>('/couple', {
          method: 'POST',
          body: JSON.stringify({ nombre, privacidadVersion: VERSION_PRIVACIDAD }),
        })
      },
      unirsePareja(nombre: string, codigo: string) {
        return call<Pareja>('/couple/join', {
          method: 'POST',
          body: JSON.stringify({ nombre, codigo, privacidadVersion: VERSION_PRIVACIDAD }),
        })
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

      /** Categories and saved references in one payload — the board needs
       * both to render. */
      obtenerTablero() {
        return call<Tablero>('/inspiraciones')
      },

      crearCategoria(nombre: string) {
        return call<Categoria>('/categorias', { method: 'POST', body: JSON.stringify({ nombre }) })
      },

      renombrarCategoria(id: string, nombre: string) {
        return call<Categoria>(`/categorias/${id}`, { method: 'PATCH', body: JSON.stringify({ nombre }) })
      },

      /** The final order, whole. The server never has to work out how the
       * other positions shifted. */
      ordenarCategorias(orden: string[]) {
        return call<{ categorias: Categoria[] }>('/categorias', { method: 'PATCH', body: JSON.stringify({ orden }) })
      },

      /** The photos filed here survive and turn up uncategorised. */
      borrarCategoria(id: string) {
        return call<{ ok: boolean }>(`/categorias/${id}`, { method: 'DELETE' })
      },

      /** Claims a photo already uploaded through subirFoto onto the board. */
      guardarInspiracion(stagedId: string, categoriaId: string | null, nota?: string) {
        return call<Inspiracion>('/inspiraciones', {
          method: 'POST',
          body: JSON.stringify({ stagedId, categoriaId, nota }),
        })
      },

      moverInspiracion(id: string, categoriaId: string | null) {
        return call<Inspiracion>(`/inspiraciones/${id}`, { method: 'PATCH', body: JSON.stringify({ categoriaId }) })
      },

      borrarInspiracion(id: string) {
        return call<{ ok: boolean }>(`/inspiraciones/${id}`, { method: 'DELETE' })
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
