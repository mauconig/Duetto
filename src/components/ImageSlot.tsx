import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

const MAX_DIM = 1000
const STORAGE_PREFIX = 'duette-img:'

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/webp', 0.85)
  } finally {
    bitmap.close?.()
  }
}

interface ImageSlotProps {
  id: string
  shape?: 'rect' | 'rounded' | 'circle'
  radius?: number
  placeholder?: string
  /** Bundled default image shown until the user uploads their own; an
   * upload always takes priority over this. */
  src?: string
  className?: string
  style?: React.CSSProperties
}

export function ImageSlot({ id, shape = 'rounded', radius = 12, placeholder = 'Foto', src, className, style }: ImageSlotProps) {
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUploaded(localStorage.getItem(STORAGE_PREFIX + id))
  }, [id])

  const displaySrc = uploaded ?? src ?? null

  async function ingest(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const url = await toDataUrl(file)
    localStorage.setItem(STORAGE_PREFIX + id, url)
    setUploaded(url)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setOver(false)
    ingest(e.dataTransfer.files?.[0])
  }

  return (
    <div
      className={`image-slot image-slot--${shape}${displaySrc ? '' : ' image-slot--empty'}${over ? ' image-slot--over' : ''}${className ? ' ' + className : ''}`}
      style={{ ...style, borderRadius: shape === 'rounded' ? radius : undefined }}
      onClick={(e) => {
        e.stopPropagation()
        displaySrc ? setLightbox(true) : inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      role="button"
      aria-label={displaySrc ? 'Ver foto' : placeholder || 'Subir foto'}
    >
      {displaySrc ? (
        <img src={displaySrc} alt="" className="image-slot__img" />
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          ingest(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {lightbox && displaySrc && (
        <div
          className="image-slot__lightbox"
          onClick={(e) => {
            e.stopPropagation()
            setLightbox(false)
          }}
        >
          <button
            type="button"
            className="image-slot__lightbox-close"
            aria-label="Cerrar"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox(false)
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6 18 18" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
          <img src={displaySrc} alt="" className="image-slot__lightbox-img" onClick={(e) => e.stopPropagation()} />
          <button
            type="button"
            className="image-slot__lightbox-replace"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox(false)
              inputRef.current?.click()
            }}
          >
            Reemplazar foto
          </button>
        </div>
      )}
    </div>
  )
}
