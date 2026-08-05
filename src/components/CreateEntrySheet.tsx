import { useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../types'
import { fileToDataUrl, storePhoto } from '../lib/photoStorage'
import { randomFondo } from '../lib/duette'
import { readExifDate } from '../lib/exif'

const MAX_FOTOS = 12

interface CreateEntrySheetProps {
  onClose: () => void
  onCrear: (entry: Album) => void
}

function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CreateEntrySheet({ onClose, onCrear }: CreateEntrySheetProps) {
  const [fecha, setFecha] = useState(hoyIso())
  const [rango, setRango] = useState(false)
  const [fechaFin, setFechaFin] = useState('')
  const [fechaManual, setFechaManual] = useState(false)
  const [fechaDetectada, setFechaDetectada] = useState(false)
  const [nota, setNota] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [guardando, setGuardando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  // Try to fill in the date(s) from the photos' own EXIF data, so the user
  // doesn't have to type it — unless they've already set it by hand.
  useEffect(() => {
    if (fechaManual || fotos.length === 0) return
    let cancelled = false
    Promise.all(fotos.map(readExifDate)).then((resultados) => {
      if (cancelled) return
      const fechas = resultados.filter((d): d is string => !!d).sort()
      if (fechas.length === 0) return
      const min = fechas[0]
      const max = fechas[fechas.length - 1]
      setFecha(min)
      setFechaDetectada(true)
      if (max !== min) {
        setRango(true)
        setFechaFin(max)
      }
    })
    return () => {
      cancelled = true
    }
  }, [fotos, fechaManual])

  function agregarFotos(lista: FileList | null) {
    if (!lista) return
    const nuevas = Array.from(lista).filter((f) => f.type.startsWith('image/'))
    setFotos((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS))
  }

  function quitarFoto(i: number) {
    setFotos((prev) => prev.filter((_, j) => j !== i))
  }

  function moverFoto(i: number, dir: -1 | 1) {
    setFotos((prev) => {
      const next = [...prev]
      const target = i + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fecha || guardando) return
    setGuardando(true)
    const id = `entry-${Date.now()}`
    for (let i = 0; i < fotos.length; i++) {
      const url = await fileToDataUrl(fotos[i])
      storePhoto(`album-cover-${id}-${i}`, url)
    }
    onCrear({
      id,
      fecha,
      fechaFin: rango && fechaFin ? fechaFin : undefined,
      nota: nota.trim() || undefined,
      fotos: fotos.length,
      fondo: randomFondo(),
    })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>Nueva entrada</h3>
          <button type="button" className="sheet__close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="sheet__form" onSubmit={handleSubmit}>
          <label className="sheet__field">
            <span>Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFechaManual(true)
                setFechaDetectada(false)
                setFecha(e.target.value)
              }}
              required
            />
            {fechaDetectada && !fechaManual && <span className="sheet__hint">Detectada de tus fotos</span>}
          </label>

          <label className="sheet__checkbox">
            <input
              type="checkbox"
              checked={rango}
              onChange={(e) => {
                setFechaManual(true)
                setRango(e.target.checked)
              }}
            />
            <span>Fue un rango de fechas (viaje de varios días)</span>
          </label>

          {rango && (
            <label className="sheet__field">
              <span>Hasta</span>
              <input
                type="date"
                value={fechaFin}
                min={fecha}
                onChange={(e) => {
                  setFechaManual(true)
                  setFechaFin(e.target.value)
                }}
              />
            </label>
          )}

          <label className="sheet__field">
            <span>Nota (opcional)</span>
            <textarea
              value={nota}
              maxLength={140}
              placeholder="Un par de palabras sobre este recuerdo..."
              onChange={(e) => setNota(e.target.value)}
            />
          </label>

          <div className="sheet__field">
            <span>Fotos</span>
            <div className="sheet__photos">
              {previews.map((url, i) => (
                <div className="sheet__photo" key={url}>
                  <img src={url} alt="" />
                  <button type="button" className="sheet__photo-remove" aria-label="Quitar foto" onClick={() => quitarFoto(i)}>
                    ×
                  </button>
                  {previews.length > 1 && (
                    <div className="sheet__photo-order">
                      <button type="button" disabled={i === 0} aria-label="Mover antes" onClick={() => moverFoto(i, -1)}>
                        ‹
                      </button>
                      <button type="button" disabled={i === previews.length - 1} aria-label="Mover después" onClick={() => moverFoto(i, 1)}>
                        ›
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <button type="button" className="sheet__photo-add" aria-label="Agregar fotos" onClick={() => fileInputRef.current?.click()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                agregarFotos(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          <button type="submit" className="sheet__submit" disabled={!fecha || guardando}>
            {guardando ? 'Guardando...' : 'Guardar recuerdo'}
          </button>
        </form>
      </div>
    </div>
  )
}
