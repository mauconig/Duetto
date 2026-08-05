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
  className?: string
  style?: React.CSSProperties
}

export function ImageSlot({ id, shape = 'rounded', radius = 12, placeholder = 'Foto', className, style }: ImageSlotProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSrc(localStorage.getItem(STORAGE_PREFIX + id))
  }, [id])

  async function ingest(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const url = await toDataUrl(file)
    localStorage.setItem(STORAGE_PREFIX + id, url)
    setSrc(url)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setOver(false)
    ingest(e.dataTransfer.files?.[0])
  }

  return (
    <div
      className={`image-slot image-slot--${shape}${over ? ' image-slot--over' : ''}${className ? ' ' + className : ''}`}
      style={{ ...style, borderRadius: shape === 'rounded' ? radius : undefined }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      role="button"
      aria-label={placeholder || 'Subir foto'}
    >
      {src ? (
        <img src={src} alt="" className="image-slot__img" />
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
    </div>
  )
}
