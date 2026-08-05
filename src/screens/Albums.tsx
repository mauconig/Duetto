import { PhotoGallery } from '../components/PhotoGallery'
import type { Album } from '../types'
import { formatFechaEntrada, photoSlotIds, sortByFecha } from '../lib/duette'

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
              <PhotoGallery ids={photoSlotIds(entrada)} fondo={entrada.fondo} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
