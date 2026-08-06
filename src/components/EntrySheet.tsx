import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../types'
import { fileToWebpBlob } from '../lib/photoStorage'
import { photoSlots, randomFondo } from '../lib/duette'
import { readExifDate } from '../lib/exif'
import { useApi } from '../lib/api'

/** Kept in step with the server's own cap in server/src/index.ts. */
const MAX_FOTOS = 32

/** Uploads run a few at a time. Downscaling is gated at two by the worker
 * pool, but it finishes far faster than the phone's uplink drains, so
 * without this the whole batch would hit the network at once and make every
 * single request slower. Module scope because only one sheet is ever open. */
const MAX_SUBIDAS = 3
let enVuelo = 0
const esperando: (() => void)[] = []

async function conCupo<T>(tarea: () => Promise<T>): Promise<T> {
  if (enVuelo >= MAX_SUBIDAS) await new Promise<void>((seguir) => esperando.push(seguir))
  enVuelo++
  try {
    return await tarea()
  } finally {
    enVuelo--
    esperando.shift()?.()
  }
}

/** Where each newly picked photo is on its way to the server. */
type EstadoFoto = 'comprimiendo' | 'subiendo' | 'lista' | 'error'

type FotoItem = { kind: 'existing'; id: string; src: string } | { kind: 'new'; file: File }

interface EntrySheetProps {
  /** Entry being edited; omit to create a brand-new one. */
  entry?: Album
  /** Photos the sheet opens with, on top of the entry's own — how a share
   * from Android arrives. */
  fotosExtra?: File[]
  onClose: () => void
  onGuardar: (entry: Album) => void
  onBorrar: (id: string) => void
}

function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fotosIniciales(entry: Album | undefined, extra: File[] | undefined): FotoItem[] {
  // The sheet only ever shows these at thumbnail size.
  const existentes: FotoItem[] = entry
    ? photoSlots(entry).map((slot) => ({ kind: 'existing', id: slot.id, src: slot.miniatura! }) as const)
    : []
  const nuevas: FotoItem[] = (extra ?? []).map((file) => ({ kind: 'new', file }) as const)
  return [...existentes, ...nuevas].slice(0, MAX_FOTOS)
}

export function EntrySheet({ entry, fotosExtra, onClose, onGuardar, onBorrar }: EntrySheetProps) {
  const editando = !!entry
  const [fecha, setFecha] = useState(entry?.fecha ?? hoyIso())
  const [rango, setRango] = useState(!!entry?.fechaFin)
  const [fechaFin, setFechaFin] = useState(entry?.fechaFin ?? '')
  const [fechaManual, setFechaManual] = useState(editando)
  const [fechaDetectada, setFechaDetectada] = useState(false)
  const [nota, setNota] = useState(entry?.nota ?? '')
  const [fotos, setFotos] = useState<FotoItem[]>(() => fotosIniciales(entry, fotosExtra))
  const [guardando, setGuardando] = useState(false)
  const [sinMetadata, setSinMetadata] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const api = useApi()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avisoTimeout = useRef<number | undefined>(undefined)
  /** Each picked photo's trip to the server — downscale, upload — keyed by
   * the File itself and resolving to the id `orden` will refer to it by. */
  const preparadas = useRef(new Map<File, Promise<string>>())
  const [estados, setEstados] = useState<ReadonlyMap<File, EstadoFoto>>(new Map())
  /** EXIF dates already read. The effect below re-runs on every add, remove
   * and reorder, and re-reading each file's first 128KB every time is work
   * the answer can't change. */
  const fechasExif = useRef(new Map<File, Promise<string | null>>())

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
    const leer = (file: File) => {
      let pendiente = fechasExif.current.get(file)
      if (!pendiente) {
        pendiente = readExifDate(file)
        fechasExif.current.set(file, pendiente)
      }
      return pendiente
    }
    Promise.all(nuevas.map((f) => leer(f.file))).then((resultados) => {
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

  /** Downscales a photo and sends it on its way, resolving to the id the
   * entry will claim it by. */
  const encolar = useCallback(
    (file: File): Promise<string> => {
      const marcar = (estado: EstadoFoto) => setEstados((prev) => new Map(prev).set(file, estado))
      marcar('comprimiendo')
      const viaje = fileToWebpBlob(file)
        .then((foto) => {
          marcar('subiendo')
          return conCupo(() => api.subirFoto(foto))
        })
        .then((id) => {
          marcar('lista')
          return id
        })
      // Handled here so a failure doesn't surface as an unhandled rejection;
      // the reason itself resurfaces when handleSubmit awaits the retry.
      viaje.catch(() => marcar('error'))
      return viaje
    },
    [api],
  )

  // Both the downscaling and the upload used to wait for the save button, so
  // a batch of photos meant staring at "Guardando..." for the whole trip.
  // Starting here spends that time while the note is still being written,
  // and by the time save is pressed the bytes are usually already up. Keyed
  // by File, so reordering or removing never redoes any of it.
  useEffect(() => {
    const vigentes = new Set<File>()
    for (const item of fotos) {
      if (item.kind !== 'new') continue
      vigentes.add(item.file)
      if (!preparadas.current.has(item.file)) preparadas.current.set(item.file, encolar(item.file))
    }
    // Photos the user removed are left to the server's own sweep; dropping
    // them here just stops this map from growing all session.
    for (const file of preparadas.current.keys()) {
      if (!vigentes.has(file)) preparadas.current.delete(file)
    }
  }, [fotos, encolar])

  const nuevas = fotos.filter((f): f is FotoItem & { kind: 'new' } => f.kind === 'new')
  const listas = nuevas.filter((f) => estados.get(f.file) === 'lista').length
  const fallidas = nuevas.filter((f) => estados.get(f.file) === 'error').length
  const enCamino = nuevas.length - listas - fallidas

  function agregarFotos(lista: FileList | null) {
    if (!lista) return
    const elegidas: FotoItem[] = Array.from(lista)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ kind: 'new', file }))
    setFotos((prev) => [...prev, ...elegidas].slice(0, MAX_FOTOS))
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

  async function borrar() {
    if (!entry || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await api.borrarEntrada(entry.id)
      onBorrar(entry.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos borrar el recuerdo')
      setGuardando(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fecha || guardando) return
    setGuardando(true)
    setError(null)
    try {
      // The photos were sent on their way as they were picked, so this
      // usually just collects ids that are already in. Anything that failed
      // on the way gets one more go now, and only that one.
      const archivosNuevos = nuevas.map((f) => f.file)
      const ids = await Promise.all(
        archivosNuevos.map((file) => {
          const previa = preparadas.current.get(file)
          if (previa && estados.get(file) !== 'error') return previa
          const reintento = encolar(file)
          preparadas.current.set(file, reintento)
          return reintento
        }),
      )
      const porArchivo = new Map(archivosNuevos.map((file, i) => [file, ids[i]]))

      const datos = {
        fecha,
        fechaFin: rango && fechaFin ? fechaFin : undefined,
        nota: nota.trim() || undefined,
        fondo: entry?.fondo ?? randomFondo(),
        orden: fotos.map((item) => (item.kind === 'existing' ? item.id : `staged:${porArchivo.get(item.file)}`)),
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
            {enCamino > 0 && (
              <span className="sheet__hint">
                Subiendo {listas} de {nuevas.length}...
              </span>
            )}
            {fallidas > 0 && (
              <span className="sheet__hint">
                {fallidas === 1 ? 'Una foto no subió' : `${fallidas} fotos no subieron`}; se reintentan al guardar.
              </span>
            )}
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
            {guardando
              ? enCamino > 0 || fallidas > 0
                ? 'Subiendo fotos...'
                : 'Guardando...'
              : editando
                ? 'Guardar cambios'
                : 'Guardar recuerdo'}
          </button>

          {editando &&
            (confirmandoBorrado ? (
              <div className="sheet__confirmar">
                <p className="sheet__confirmar-texto">
                  Se borra para los dos, con sus {fotos.length === 1 ? 'foto' : `${fotos.length} fotos`}. No se puede
                  deshacer.
                </p>
                <div className="sheet__confirmar-acciones">
                  <button type="button" className="sheet__cancelar" onClick={() => setConfirmandoBorrado(false)}>
                    Cancelar
                  </button>
                  <button type="button" className="sheet__borrar-confirmar" disabled={guardando} onClick={borrar}>
                    {guardando ? 'Borrando...' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="sheet__borrar" disabled={guardando} onClick={() => setConfirmandoBorrado(true)}>
                Borrar recuerdo
              </button>
            ))}
        </form>
      </div>
    </div>
  )
}
