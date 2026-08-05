import type { Articulo } from '../types'

interface ArticlesProps {
  articulos: Articulo[]
  onAbrir: (articulo: Articulo) => void
}

export function Articles({ articulos, onAbrir }: ArticlesProps) {
  return (
    <div className="screen">
      <h2>Artículos</h2>
      {articulos.map((art) => (
        <div className="article-card" key={art.id} onClick={() => onAbrir(art)} role="button">
          <div className="article-card__meta-row">
            <span className="tag-pill">{art.tag}</span>
            <span className="article-card__min">{art.min} min</span>
          </div>
          <div className="article-card__title">{art.titulo}</div>
          <p className="article-card__resumen">{art.resumen}</p>
        </div>
      ))}
    </div>
  )
}
