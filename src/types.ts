export type Tab = 'inicio' | 'albumes' | 'ruleta' | 'articulos' | 'perfil'

export interface Momento {
  fecha: string
  lugar: string
  nota: string
  conFoto: boolean
  fondo: string
}

export interface Album {
  id: string
  titulo: string
  meta: string
  fotos: string
  conFoto: boolean
  fondo: string
  momentos: Momento[]
}

export interface Articulo {
  id: string
  tag: string
  titulo: string
  min: number
  resumen: string
  cuerpo: string[]
}
