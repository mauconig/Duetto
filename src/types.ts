export type Tab = 'inicio' | 'albumes' | 'ruleta' | 'articulos' | 'perfil'

export interface Album {
  id: string
  fecha: string
  fechaFin?: string
  nota?: string
  fotos: number
  fotoUrls?: string[]
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
