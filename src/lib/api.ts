import { useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/react'
import type { Album } from '../types'
import { cifrarConPareja, cifrarTexto, descifrarTexto } from './cripto'
import { type EstadoCifrado, llaveActual } from './llave'
import type { FotoProcesada } from './photoStorage'

/* Encryption sits in this layer rather than in the screens, so no component
 * has to remember it exists. Everything below asks `llaveActual()` — when
 * there's no key the app behaves exactly as it did before, which is what makes
 * this safe to ship to couples who never turn it on. */

/** Text on its way out. Returns the flag alongside, because the server stores
 * per row whether that row is ciphertext. */
async function protegerTexto(texto: string): Promise<{ valor: string; cifrado: boolean }> {
  const llave = llaveActual()
  if (!llave || !texto) return { valor: texto, cifrado: false }
  return { valor: await cifrarTexto(texto, llave), cifrado: true }
}

/** Text on its way in. A locked session gets undefined rather than base64:
 * showing someone a wall of ciphertext where their note used to be reads as
 * data loss, and it isn't. */
async function abrirTexto(valor: string | undefined, cifrado: unknown): Promise<string | undefined> {
  if (!valor || !cifrado) return valor
  const llave = llaveActual()
  if (!llave) return undefined
  try {
    return await descifrarTexto(valor, llave)
  } catch {
    // Wrong key for this row — possible mid-migration, or a partner who
    // unlocked with a stale key. Hiding it beats rendering garbage.
    return undefined
  }
}

/** Photo bytes on their way out. The thumbnail gets its own envelope with its
 * own derivation id, so the two halves of one photo don't share a key. */
async function protegerBlob(blob: Blob): Promise<Blob> {
  const llave = llaveActual()
  if (!llave) return blob
  return new Blob([(await cifrarConPareja(new Uint8Array(await blob.arrayBuffer()), llave)) as BlobPart])
}

/** A recuerdo with its nota encrypted. The dates stay as they are — they order
 * the timeline and feed "recuerdo del día", and that leak is deliberate and
 * written down in plan.md rather than overlooked. */
async function conNota<T extends { nota?: string }>(datos: T) {
  const { valor, cifrado } = await protegerTexto(datos.nota ?? '')
  return { ...datos, nota: valor || undefined, cifrado }
}

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
  premium: boolean
  /** Bytes the couple's recuerdos, staging and inspiración currently take up. */
  espacioUsado: number
  /** The cap that applies — the premium tier's or the free tier's. */
  espacioLimite: number
  /** Whether this couple encrypts, and everything needed to *attempt* an
   * unlock. Useless without a secret the server has never seen. */
  cifrado: EstadoCifrado
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
  /** Set by the server when `nombre` is ciphertext. Only the API layer looks
   * at it — by the time a screen sees a Categoria the name is readable. */
  cifrado?: boolean | number
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
  cifrado?: boolean | number
}

export interface Tablero {
  categorias: Categoria[]
  fotos: Inspiracion[]
}

export type ProveedorMusica = 'spotify' | 'youtube' | 'apple'

export interface PerfilCancion {
  titulo: string | null
  artista: string | null
  album: string | null
  proveedor: ProveedorMusica | null
  url: string | null
  portadaUrl: string | null
}

export interface PerfilDatoPersonalizado {
  id: string
  etiqueta: string
  valor: string
  posicion: number
}

export interface PerfilDatos {
  colorFavorito: {
    hex: string | null
    nombre: string | null
  }
  proveedorMusicaPreferido: ProveedorMusica | null
  cancion: PerfilCancion
  comidaFavorita: string | null
  bebidaFavorita: string | null
  hobbies: string | null
  gustos: string | null
  disgustos: string | null
  ideasRegalo: string | null
  talles: {
    arriba: string | null
    abajo: string | null
    zapatos: string | null
    otro: string | null
  }
  personalizados: PerfilDatoPersonalizado[]
}

export interface PerfilMiembro {
  nombre: string
  imagenUrl: string | null
  datos: PerfilDatos
}

export interface PerfilesPareja {
  propio: PerfilMiembro | null
  pareja: PerfilMiembro | null
}

export interface MetadataMusica {
  titulo: string | null
  artista: string | null
  album: string | null
  proveedor: ProveedorMusica
  url: string
  portadaUrl: string | null
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

      obtenerPerfiles() {
        return call<PerfilesPareja>('/couple/profiles')
      },

      guardarPerfilPareja(datos: PerfilDatos) {
        return call<PerfilesPareja>('/couple/profile/me', { method: 'PUT', body: JSON.stringify(datos) })
      },

      obtenerMetadataMusica(url: string) {
        return call<MetadataMusica>(`/music/metadata?url=${encodeURIComponent(url)}`)
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

      async obtenerEntradas() {
        const entradas = await call<(Album & { cifrado?: boolean })[]>('/entries')
        return Promise.all(entradas.map(async (e) => ({ ...e, nota: await abrirTexto(e.nota, e.cifrado) })))
      },

      /** Uploads one downscaled photo and returns the id that `orden` refers
       * to it by. The sheet calls this as each photo finishes, so saving the
       * recuerdo afterwards carries no files at all. */
      async subirFoto(foto: FotoProcesada): Promise<string> {
        const form = new FormData()
        form.append('foto', await protegerBlob(foto.completa), 'foto.webp')
        form.append('miniatura', await protegerBlob(foto.miniatura), 'min.webp')
        // The name stays .webp on purpose: it is what the server writes into
        // the store, and the store has never cared what the bytes are.
        if (llaveActual()) form.append('cifrado', '1')
        const { id } = await enviarFormulario<{ id: string }>('/photos', 'POST', form)
        return id
      },

      async crearEntrada(datos: DatosEntrada) {
        const entrada = await call<Album>('/entries', { method: 'POST', body: JSON.stringify(await conNota(datos)) })
        return { ...entrada, nota: datos.nota }
      },

      async editarEntrada(id: string, datos: DatosEntrada) {
        const entrada = await call<Album>(`/entries/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(await conNota(datos)),
        })
        return { ...entrada, nota: datos.nota }
      },

      borrarEntrada(id: string) {
        return call<{ ok: boolean }>(`/entries/${id}`, { method: 'DELETE' })
      },

      async obtenerIdeas() {
        const ideas = await call<(Idea & { cifrado?: number })[]>('/ideas')
        return Promise.all(
          ideas.map(async (i) => ({ ...i, texto: (await abrirTexto(i.texto, i.cifrado)) ?? '' })),
        )
      },

      async agregarIdea(texto: string) {
        const { valor, cifrado } = await protegerTexto(texto)
        const idea = await call<Idea>('/ideas', { method: 'POST', body: JSON.stringify({ texto: valor, cifrado }) })
        // Echo back what the user typed rather than what was stored: the
        // server can only return the ciphertext it was given.
        return { ...idea, texto }
      },

      borrarIdea(id: string) {
        return call<{ ok: boolean }>(`/ideas/${id}`, { method: 'DELETE' })
      },

      /** Categories and saved references in one payload — the board needs
       * both to render. */
      async obtenerTablero() {
        const t = await call<Tablero>('/inspiraciones')
        return {
          categorias: await Promise.all(
            t.categorias.map(async (c) => ({ ...c, nombre: (await abrirTexto(c.nombre, c.cifrado)) ?? '' })),
          ),
          fotos: await Promise.all(t.fotos.map(async (f) => ({ ...f, nota: await abrirTexto(f.nota, f.cifrado) }))),
        }
      },

      async crearCategoria(nombre: string) {
        const { valor, cifrado } = await protegerTexto(nombre)
        const c = await call<Categoria>('/categorias', { method: 'POST', body: JSON.stringify({ nombre: valor, cifrado }) })
        return { ...c, nombre }
      },

      async renombrarCategoria(id: string, nombre: string) {
        const { valor, cifrado } = await protegerTexto(nombre)
        const c = await call<Categoria>(`/categorias/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nombre: valor, cifrado }),
        })
        return { ...c, nombre }
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
      async guardarInspiracion(
        stagedId: string,
        categoriaId: string | null,
        nota?: string,
        origenPinterest?: { esVideo: boolean; urlOrigen: string },
      ) {
        const { valor, cifrado } = await protegerTexto(nota ?? '')
        const guardada = await call<Inspiracion>('/inspiraciones', {
          method: 'POST',
          body: JSON.stringify({ stagedId, categoriaId, nota: valor || undefined, cifrado, ...origenPinterest }),
        })
        return { ...guardada, nota }
      },

      moverInspiracion(id: string, categoriaId: string | null) {
        return call<Inspiracion>(`/inspiraciones/${id}`, { method: 'PATCH', body: JSON.stringify({ categoriaId }) })
      },

      borrarInspiracion(id: string) {
        return call<{ ok: boolean }>(`/inspiraciones/${id}`, { method: 'DELETE' })
      },

      /* ------------------------------------------------------------ cifrado */

      /** Turns encryption on. The body is produced by `prepararActivacion` and
       * is opaque to the server — the couple key wrapped twice, plus salts. */
      activarCifrado(cuerpo: Record<string, unknown>) {
        return call<Pareja>('/cifrado/activar', { method: 'POST', body: JSON.stringify(cuerpo) })
      },

      /** Rewraps the same key under a new passphrase. Nothing already
       * encrypted has to be touched, and the recovery code keeps working. */
      cambiarFrase(cuerpo: Record<string, unknown>) {
        return call<{ ok: boolean }>('/cifrado/frase', { method: 'POST', body: JSON.stringify(cuerpo) })
      },

      /** What the migration of an existing history still has to get through.
       * Text rows arrive with their plaintext so it can be encrypted here;
       * photos arrive as ids, because their bytes have to be fetched, wrapped
       * and sent back one at a time. */
      pendientesDeCifrar() {
        return call<{
          fotos: string[]
          inspiraciones: string[]
          notas: { id: string; nota: string }[]
          carpetas: { id: string; nombre: string }[]
          ideas: { id: string; texto: string }[]
        }>('/cifrado/pendientes')
      },

      /** One row per call. The migration runs on a phone and can stop at any
       * moment, so every step has to stand on its own. */
      async migrarTexto(tipo: 'nota' | 'carpeta' | 'idea', id: string, texto: string) {
        const llave = llaveActual()
        if (!llave) throw new ApiError('Primero desbloqueá con tu frase', 400)
        return call<{ ok: boolean }>('/cifrado/texto', {
          method: 'POST',
          body: JSON.stringify({ tipo, id, valor: await cifrarTexto(texto, llave) }),
        })
      },

      /** Fetches a photo that is still in the clear, encrypts it here, and
       * hands it back. It has to happen on this device: the server has no key,
       * which is the entire point and what separates this from the move to R2.
       *
       * The fetch goes through the service worker like any other photo — the
       * row isn't flagged yet, so it comes back as plain WebP and is passed
       * through untouched. */
      async migrarFoto(id: string, tipo: 'foto' | 'inspiracion') {
        const llave = llaveActual()
        if (!llave) throw new ApiError('Primero desbloqueá con tu frase', 400)
        const [completa, miniatura] = await Promise.all([
          fetch(`/api/photos/${id}`).then((r) => r.blob()),
          fetch(`/api/photos/${id}?tamano=min`).then((r) => r.blob()),
        ])
        const form = new FormData()
        form.append('foto', await protegerBlob(completa), 'foto.webp')
        form.append('miniatura', await protegerBlob(miniatura), 'min.webp')
        form.append('tipo', tipo)
        return enviarFormulario<{ ok: boolean }>(`/cifrado/foto/${id}`, 'POST', form)
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
