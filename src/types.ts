export type Tab = 'inicio' | 'albumes' | 'ruleta' | 'articulos' | 'perfil'

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

export interface Articulo {
  id: string
  tag: string
  titulo: string
  min: number
  resumen: string
  cuerpo: string[]
}
