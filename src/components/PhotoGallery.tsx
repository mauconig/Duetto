import { ImageSlot } from './ImageSlot'
import type { PhotoSlot } from '../lib/duette'

const FALLBACK_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

const MAX_THUMBS = 3

interface PhotoGalleryProps {
  slots: PhotoSlot[]
  fondo: string
}

export function PhotoGallery({ slots, fondo }: PhotoGalleryProps) {
  if (slots.length === 0) {
    return (
      <div className="timeline__photo timeline__photo-fallback" style={{ background: fondo }}>
        {FALLBACK_ICON}
      </div>
    )
  }

  if (slots.length === 1) {
    return (
      <ImageSlot id={slots[0].id} src={slots[0].src} shape="rounded" radius={18} placeholder="Foto" className="timeline__photo" />
    )
  }

  const [main, ...resto] = slots
  const thumbs = resto.slice(0, MAX_THUMBS)
  const restantes = resto.length - thumbs.length

  return (
    <div className="timeline__gallery">
      <ImageSlot id={main.id} src={main.src} shape="rounded" radius={18} placeholder="Foto" className="timeline__gallery-main" />
      <div className="timeline__gallery-thumbs">
        {thumbs.map((slot, i) => (
          <div className="timeline__gallery-thumb" key={slot.id}>
            <ImageSlot id={slot.id} src={slot.src} shape="rounded" radius={12} placeholder="" />
            {i === thumbs.length - 1 && restantes > 0 && (
              <div className="timeline__gallery-more">+{restantes}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
