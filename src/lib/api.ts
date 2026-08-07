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
  /** The partner's avatar, as Clerk hosts it. Null until they've opened the
   * app once, or if they have no photo. Only theirs: our own comes straight
   * from Clerk in the browser, where it's always current. */
  imagenPareja: string | null
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
  /** True when this was saved from a Pinterest *video* pin — the file itself
   * is still just the cover frame, since that's all Pinterest ever gives up.
   * Doesn't gate anything on its own; `urlOrigen` is set for a photo pin
   * just as much as a video one. */
  esVideo: boolean
  /** Where the pin this was saved from lives, whenever it came from
   * Pinterest at all — photo pin or video pin. */
  urlOrigen?: string
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

      /** Tells the server where our avatar lives, so the partner can see it.
       * An empty string means we no longer have one. */
      guardarImagenPropia(imagenUrl: string) {
        return call<{ ok: boolean; imagenUrl: string | null }>('/me/imagen', {
          method: 'PUT',
          body: JSON.stringify({ imagenUrl }),
        })
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

      /** Claims a photo already uploaded through subirFoto onto the board.
       * `origenPinterest` only ever comes from a resolved Pinterest link —
       * photo pin or video pin alike — and remembers where it came from, so
       * the board can link back to the pin itself. */
      guardarInspiracion(
        stagedId: string,
        categoriaId: string | null,
        nota?: string,
        origenPinterest?: { esVideo: boolean; urlOrigen: string },
      ) {
        return call<Inspiracion>('/inspiraciones', {
          method: 'POST',
          body: JSON.stringify({ stagedId, categoriaId, nota, ...origenPinterest }),
        })
      },

      moverInspiracion(id: string, categoriaId: string | null) {
        return call<Inspiracion>(`/inspiraciones/${id}`, { method: 'PATCH', body: JSON.stringify({ categoriaId }) })
      },

      borrarInspiracion(id: string) {
        return call<{ ok: boolean }>(`/inspiraciones/${id}`, { method: 'DELETE' })
      },

      /** The image behind a shared link, as a File the rest of the app can
       * treat like any picked photo. Pinterest shares a pin as a URL and
       * never as a file, and i.pinimg.com sends no CORS headers, so the
       * server is the only one that can go get the bytes. */
      /** What the link is, without fetching the picture behind it — for when
       * the share already handed us the image as a file and only the pin's
       * nature is missing. */
      infoDeEnlace(enlace: string) {
        return call<{ esVideo: boolean; titulo?: string }>(`/enlace/info?url=${encodeURIComponent(enlace)}`)
      },

      async imagenDeEnlace(enlace: string): Promise<{ archivo: File; titulo: string | null; esVideo: boolean }> {
        const token = await getToken()
        const res = await fetch(`/api/enlace/imagen?url=${encodeURIComponent(enlace)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) {
          const cuerpo = (await res.json().catch(() => ({}))) as { error?: string }
          throw new ApiError(cuerpo?.error ?? 'No pudimos abrir ese enlace', res.status)
        }
        const blob = await res.blob()
        const crudo = res.headers.get('X-Titulo')
        return {
          archivo: new File([blob], 'compartida.jpg', { type: blob.type || 'image/jpeg' }),
          titulo: crudo ? decodeURIComponent(crudo) : null,
          // Pinterest never sends the clip itself, only its cover frame — this
          // just tells the sheet that's what happened, so it can say so.
          esVideo: res.headers.get('X-Es-Video') === '1',
        }
      },
    }),
    [call, enviarFormulario, getToken],
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
