import { useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../types'
import { fileToWebpBlob } from '../lib/photoStorage'
import { photoSlots, randomFondo } from '../lib/duette'
import { readExifDate } from '../lib/exif'
import { useApi } from '../lib/api'

const MAX_FOTOS = 12

type FotoItem = { kind: 'existing'; id: string; src: string } | { kind: 'new'; file: File }

interface EntrySheetProps {
  /** Entry being edited; omit to create a brand-new one. */
  entry?: Album
  onClose: () => void
  onGuardar: (entry: Album) => void
}

function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fotosIniciales(entry: Album | undefined): FotoItem[] {
  if (!entry) return []
  return photoSlots(entry).map((slot) => ({ kind: 'existing', id: slot.id, src: slot.src! }) as const)
}

export function EntrySheet({ entry, onClose, onGuardar }: EntrySheetProps) {
  const editando = !!entry
  const [fecha, setFecha] = useState(entry?.fecha ?? hoyIso())
  const [rango, setRango] = useState(!!entry?.fechaFin)
  const [fechaFin, setFechaFin] = useState(entry?.fechaFin ?? '')
  const [fechaManual, setFechaManual] = useState(editando)
  const [fechaDetectada, setFechaDetectada] = useState(false)
  const [nota, setNota] = useState(entry?.nota ?? '')
  const [fotos, setFotos] = useState<FotoItem[]>(() => fotosIniciales(entry))
  const [guardando, setGuardando] = useState(false)
  const [sinMetadata, setSinMetadata] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const api = useApi()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avisoTimeout = useRef<number | undefined>(undefined)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const previews = useMemo(() => fotos.map((f) => (f.kind === 'existing' ? f.src : URL.createObjectURL(f.file))), [fotos])
  useEffect(() => {
    return () => {
      fotos.forEach((f, i) => {
        if (f.kind === 'new') URL.revokeObjectURL(previews[i])
      })
    }
  }, [fotos, previews])

  // Try to fill in the date(s) from newly added photos' EXIF data, so the
  // user doesn't have to type it — unless they've already set it by hand
  // (which, when editing, starts out true: don't second-guess a date the
  // entry already had just because a photo got added).
  useEffect(() => {
    const nuevas = fotos.filter((f): f is FotoItem & { kind: 'new' } => f.kind === 'new')
    if (fechaManual || nuevas.length === 0) return
    let cancelled = false
    Promise.all(nuevas.map((f) => readExifDate(f.file))).then((resultados) => {
      if (cancelled) return
      const fechas = resultados.filter((d): d is string => !!d).sort()
      if (fechas.length === 0) {
        setSinMetadata(true)
        window.clearTimeout(avisoTimeout.current)
        avisoTimeout.current = window.setTimeout(() => setSinMetadata(false), 5000)
        return
      }
      setSinMetadata(false)
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

  useEffect(() => () => window.clearTimeout(avisoTimeout.current), [])

  function agregarFotos(lista: FileList | null) {
    if (!lista) return
    const nuevas: FotoItem[] = Array.from(lista)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ kind: 'new', file }))
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
    setError(null)
    try {
      // Describe the final order first (indices assigned synchronously),
      // then downscale one photo at a time — a dozen 2500px canvases at
      // once is enough to exhaust memory on a phone.
      const archivosNuevos: File[] = []
      const orden = fotos.map((item) => {
        if (item.kind === 'existing') return item.id
        const indice = archivosNuevos.length
        archivosNuevos.push(item.file)
        return `nuevo:${indice}`
      })
      const fotosNuevas: Blob[] = []
      for (const archivo of archivosNuevos) {
        fotosNuevas.push(await fileToWebpBlob(archivo))
      }

      const datos = {
        fecha,
        fechaFin: rango && fechaFin ? fechaFin : undefined,
        nota: nota.trim() || undefined,
        fondo: entry?.fondo ?? randomFondo(),
        orden,
        fotosNuevas,
      }
      const guardada = entry ? await api.editarEntrada(entry.id, datos) : await api.crearEntrada(datos)
      onGuardar(guardada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el recuerdo')
      setGuardando(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{editando ? 'Editar recuerdo' : 'Nuevo recuerdo'}</h3>
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
            {sinMetadata && <span className="sheet__toast">No se pudo encontrar la fecha en las fotos</span>}
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
                <div className="sheet__photo" key={fotos[i].kind === 'existing' ? fotos[i].id : url}>
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

          {error && <div className="onboarding__error">{error}</div>}

          <button type="submit" className="sheet__submit" disabled={!fecha || guardando}>
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar recuerdo'}
          </button>
        </form>
      </div>
    </div>
  )
}
