import { ImageSlot } from '../components/ImageSlot'
import type { Album } from '../types'
import { formatFechaEntrada, sortByFecha } from '../lib/duette'

interface AlbumsProps {
  albumes: Album[]
}

export function Albums({ albumes }: AlbumsProps) {
  const entradas = sortByFecha(albumes)

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

      <div className="timeline">
        {entradas.map((entrada) => (
          <div className="timeline__row" key={entrada.id}>
            <div className="timeline__rail">
              <div className="timeline__dot" />
              <div className="timeline__line" />
            </div>
            <div className="timeline__content">
              <div className="timeline__fecha">{formatFechaEntrada(entrada)}</div>
              {entrada.conFoto ? (
                <ImageSlot
                  id={`album-cover-${entrada.id}`}
                  shape="rounded"
                  radius={18}
                  placeholder="Foto"
                  className="timeline__photo"
                />
              ) : (
                <div className="timeline__photo timeline__photo-fallback" style={{ background: entrada.fondo }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
