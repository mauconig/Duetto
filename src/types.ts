export type Tab = 'inicio' | 'albumes' | 'ruleta' | 'inspiracion' | 'perfil'

export interface Album {
  id: string
  fecha: string
  fechaFin?: string
  nota?: string
  /** Photo ids from the API, in display order — the first one is the large
   * one in PhotoGallery. */
  fotoIds: string[]
  fondo: string
}

