import { ImageSlot } from '../components/ImageSlot'
import type { Album } from '../types'

interface AlbumsProps {
  albumes: Album[]
  onAbrir: (album: Album) => void
}

export function Albums({ albumes, onAbrir }: AlbumsProps) {
  return (
    <div className="screen">
      <div className="page-header">
        <h2>Álbumes</h2>
        <button type="button" className="round-icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {albumes.map((alb) => (
        <div key={alb.id} className="album-card">
          {alb.conFoto ? (
            <div className="album-card__photo">
              <ImageSlot id={`album-cover-${alb.id}`} shape="rect" placeholder="Portada del álbum" />
            </div>
          ) : (
            <div className="album-card__blank" style={{ background: alb.fondo }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </div>
          )}
          <span className="album-card__count">{alb.fotos}</span>
          <div className="album-card__overlay" onClick={() => onAbrir(alb)} role="button">
            <div className="album-card__overlay-row">
              <div>
                <div className="album-card__title">{alb.titulo}</div>
                <div className="album-card__meta">{alb.meta}</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="album-card__chevron">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
