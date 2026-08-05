import { ImageSlot } from '../components/ImageSlot'
import type { Album } from '../types'

interface AlbumDetailProps {
  album: Album
  onVolver: () => void
}

export function AlbumDetail({ album, onVolver }: AlbumDetailProps) {
  return (
    <div className="screen">
      <div className="detail-header">
        <button type="button" className="back-btn" onClick={onVolver}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div>
          <div className="detail-header__title">{album.titulo}</div>
          <div className="detail-header__meta">{album.meta}</div>
        </div>
      </div>

      <div className="timeline">
        {album.momentos.map((mom, i) => (
          <div className="timeline__row" key={i}>
            <div className="timeline__rail">
              <div className="timeline__dot" />
              <div className="timeline__line" />
            </div>
            <div className="timeline__content">
              <div className="timeline__fecha">{mom.fecha}</div>
              <div className="timeline__lugar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5737a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {mom.lugar}
              </div>
              <p className="timeline__nota">{mom.nota}</p>
              <div className="timeline__photos">
                {mom.conFoto && (
                  <ImageSlot
                    id={`momento-${album.id}-${i}`}
                    shape="rounded"
                    radius={18}
                    placeholder="Foto"
                    style={{ width: '100%', height: 90 }}
                  />
                )}
                <div className="timeline__photo-fallback" style={{ background: mom.fondo }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
