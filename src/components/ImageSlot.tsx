import { useCallback, useState } from 'react'
import { useT } from '../lib/i18n/contexto'

interface ImageSlotProps {
  shape?: 'rect' | 'rounded' | 'circle'
  radius?: number
  placeholder?: string
  /** Photo URL from the API; empty renders the placeholder state. */
  src?: string
  className?: string
  style?: React.CSSProperties
  onOpen?: () => void
}

/** Displays a photo (or an empty placeholder). Adding and replacing photos
 * happens in EntrySheet, which owns the whole set for an entry. */
/** No default caption: every caller in this app passes one, or passes an
 * empty string to opt out on purpose — a hardcoded Spanish default here
 * would be a trap for whichever one forgets. */
export function ImageSlot({ shape = 'rounded', radius = 12, placeholder = '', src, className, style, onOpen }: ImageSlotProps) {
  const t = useT()
  const [lista, setLista] = useState(false)

  /* A photo already in cache can finish loading before React attaches onLoad,
   * which would leave the tint sitting on top of a picture that is already
   * there. Reading `complete` when the element mounts catches that; onLoad
   * catches everything else.
   *
   * Paired with key={src} on the <img>: changing the photo remounts it, so
   * this runs again and the state resets with it — no effect needed. */
  const alMontar = useCallback((img: HTMLImageElement | null) => {
    if (img) setLista(img.complete)
  }, [])

  return (
    <div
      className={`image-slot image-slot--${shape}${src ? '' : ' image-slot--empty'}${className ? ' ' + className : ''}`}
      style={{ ...style, borderRadius: shape === 'rounded' ? radius : undefined }}
      onClick={
        onOpen
          ? (e) => {
              e.stopPropagation()
              onOpen()
            }
          : undefined
      }
      role={onOpen ? 'button' : undefined}
      aria-label={onOpen ? t('imageslot_ver_foto') : undefined}
    >
      {src ? (
        <>
          {!lista && <div className="image-slot__cargando" />}
          <img
            key={src}
            ref={alMontar}
            src={src}
            alt=""
            className={`image-slot__img${lista ? ' image-slot__img--lista' : ''}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setLista(true)}
            // A photo that won't load clears the tint too. Leaving it
            // breathing forever would promise something that is never coming.
            onError={() => setLista(true)}
          />
        </>
      ) : (
        <div className="image-slot__empty">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          {placeholder && <span className="image-slot__caption">{placeholder}</span>}
        </div>
      )}
    </div>
  )
}
