import type { Articulo } from '../types'

interface ArticleDetailProps {
  articulo: Articulo
  onVolver: () => void
}

export function ArticleDetail({ articulo, onVolver }: ArticleDetailProps) {
  return (
    <div className="screen screen--tight">
      <button type="button" className="back-btn" onClick={onVolver}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div className="article-detail__meta-row">
        <span className="tag-pill">{articulo.tag}</span>
        <span className="article-card__min">{articulo.min} min de lectura</span>
      </div>
      <h2>{articulo.titulo}</h2>
      {articulo.cuerpo.map((par, i) => (
        <p className="article-detail__paragraph" key={i}>
          {par}
        </p>
      ))}
    </div>
  )
}
