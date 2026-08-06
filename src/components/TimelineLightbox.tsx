import { useRef, useState } from 'react'
import type { PhotoSlot } from '../lib/duette'

const SWIPE_THRESHOLD = 40

interface TimelineLightboxProps {
  slots: PhotoSlot[]
  startIndex: number
  onClose: () => void
  onEditar: () => void
}

export function TimelineLightbox({ slots, startIndex, onClose, onEditar }: TimelineLightboxProps) {
  const [i, setI] = useState(startIndex)
  const touchStartX = useRef<number | null>(null)

  function anterior() {
    setI((cur) => Math.max(cur - 1, 0))
  }
  function siguiente() {
    setI((cur) => Math.min(cur + 1, slots.length - 1))
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (delta > SWIPE_THRESHOLD) anterior()
    else if (delta < -SWIPE_THRESHOLD) siguiente()
  }

  const src = slots[i].src

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button type="button" className="lightbox-close" aria-label="Cerrar" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </svg>
      </button>

      {slots.length > 1 && (
        <div className="lightbox-count">
          {i + 1} / {slots.length}
        </div>
      )}

      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {slots.length > 1 && i > 0 && (
          <button type="button" className="lightbox-arrow lightbox-arrow--prev" aria-label="Foto anterior" onClick={anterior}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {src && <img src={src} alt="" className="lightbox-img" />}
        {slots.length > 1 && i < slots.length - 1 && (
          <button type="button" className="lightbox-arrow lightbox-arrow--next" aria-label="Foto siguiente" onClick={siguiente}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      <button
        type="button"
        className="lightbox-edit"
        onClick={(e) => {
          e.stopPropagation()
          onEditar()
        }}
      >
        Editar recuerdo
      </button>
    </div>
  )
}
