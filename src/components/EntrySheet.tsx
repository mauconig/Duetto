import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Album } from '../types'
import { fileToWebpBlob } from '../lib/photoStorage'
import { photoSlots, randomFondo } from '../lib/duette'
import { readExifDate } from '../lib/exif'
import { useApi } from '../lib/api'
import { useT } from '../lib/i18n/contexto'
import { traducirError } from '../lib/i18n/erroresServidor'

/** Kept in step with the server's own cap in server/src/index.ts. */
const MAX_FOTOS = 30

/** How long a finger stays put before a photo lifts. Long enough that
 * scrolling past the grid isn't mistaken for a drag, short enough that it
 * doesn't feel like the app is thinking about it. */
const MS_PARA_LEVANTAR = 180

/** A drag in progress. A ref and not state: this changes on every pointer
 * move, and re-rendering the sheet at that rate to store a number nobody
 * paints would be a waste. `indice` follows the photo as the tiles shuffle
 * under it, so it's where the photo is *now*, not where it started. */
interface Gesto {
  id: number
  indice: number
  levantado: boolean
  timer: number
}

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
  const t = useT()
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
  /** Index of the photo currently held, or null. Only for painting it as
   * lifted — the drag itself is tracked in a ref. */
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  const arrastre = useRef<Gesto | null>(null)
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

  /** Pulls a photo out and puts it back somewhere else, rather than swapping
   * the two — dragging past three photos should slide those three over, not
   * scramble them. */
  function reubicarFoto(desde: number, hasta: number) {
    setFotos((prev) => {
      if (desde === hasta || hasta < 0 || hasta >= prev.length) return prev
      const next = [...prev]
      const [movida] = next.splice(desde, 1)
      next.splice(hasta, 0, movida)
      return next
    })
  }

  /** Which photo is under the finger. Reading the DOM beats tracking
   * rectangles ourselves: the grid wraps, and the answer has to stay right
   * while the tiles move around mid-drag. */
  function indiceBajoElPuntero(x: number, y: number): number | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const indice = (el as HTMLElement).dataset?.indice
      if (indice !== undefined) return Number(indice)
    }
    return null
  }

  function alPresionar(e: React.PointerEvent<HTMLDivElement>, i: number) {
    // The × and the arrows live inside the tile and are not handles.
    if ((e.target as HTMLElement).closest('button')) return
    if (fotos.length < 2) return

    const contenedor = e.currentTarget.parentElement
    contenedor?.setPointerCapture(e.pointerId)
    const gesto: Gesto = { id: e.pointerId, indice: i, levantado: false, timer: 0 }
    // A mouse has no scrolling to disambiguate from, so it lifts at once. A
    // finger holds first, which is also what makes the lift feel deliberate
    // instead of accidental.
    const espera = e.pointerType === 'touch' ? MS_PARA_LEVANTAR : 0
    gesto.timer = window.setTimeout(() => {
      gesto.levantado = true
      setArrastrando(gesto.indice)
      navigator.vibrate?.(12)
    }, espera)
    arrastre.current = gesto
  }

  function alArrastrar(e: React.PointerEvent<HTMLDivElement>) {
    const gesto = arrastre.current
    if (!gesto || e.pointerId !== gesto.id || !gesto.levantado) return
    const destino = indiceBajoElPuntero(e.clientX, e.clientY)
    if (destino === null || destino === gesto.indice) return
    reubicarFoto(gesto.indice, destino)
    gesto.indice = destino
    setArrastrando(destino)
  }

  function alSoltar() {
    const gesto = arrastre.current
    if (!gesto) return
    window.clearTimeout(gesto.timer)
    arrastre.current = null
    setArrastrando(null)
  }

  async function borrar() {
    if (!entry || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await api.borrarEntrada(entry.id)
      onBorrar(entry.id)
    } catch (err) {
      setError(err instanceof Error ? traducirError(err.message, t) : t('recuerdo_error_borrar'))
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
      setError(err instanceof Error ? traducirError(err.message, t) : t('recuerdo_error_guardar'))
      setGuardando(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{editando ? t('lightbox_editar_recuerdo') : t('recuerdo_nuevo_titulo')}</h3>
          <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="sheet__form" onSubmit={handleSubmit}>
          <label className="sheet__field">
            <span>{t('comun_fecha')}</span>
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
            {fechaDetectada && !fechaManual && <span className="sheet__hint">{t('recuerdo_fecha_detectada')}</span>}
            {sinMetadata && <span className="sheet__toast">{t('recuerdo_fecha_no_encontrada')}</span>}
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
            <span>{t('recuerdo_rango_checkbox')}</span>
          </label>

          {rango && (
            <label className="sheet__field">
              <span>{t('recuerdo_hasta')}</span>
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
            <span>{t('recuerdo_nota_label')}</span>
            <textarea
              value={nota}
              maxLength={140}
              placeholder={t('recuerdo_nota_placeholder')}
              onChange={(e) => setNota(e.target.value)}
            />
          </label>

          <div className="sheet__field">
            <span>{t('comun_fotos')}</span>
            <div
              className="sheet__photos"
              onPointerMove={alArrastrar}
              onPointerUp={alSoltar}
              onPointerCancel={alSoltar}
            >
              {previews.map((url, i) => (
                <div
                  className={`sheet__photo${arrastrando === i ? ' sheet__photo--alzada' : ''}`}
                  key={fotos[i].kind === 'existing' ? fotos[i].id : url}
                  data-indice={i}
                  onPointerDown={(e) => alPresionar(e, i)}
                >
                  <img src={url} alt="" draggable={false} />
                  <button type="button" className="sheet__photo-remove" aria-label={t('recuerdo_quitar_foto')} onClick={() => quitarFoto(i)}>
                    ×
                  </button>
                  {previews.length > 1 && (
                    <div className="sheet__photo-order">
                      <button type="button" disabled={i === 0} aria-label={t('recuerdo_mover_antes')} onClick={() => moverFoto(i, -1)}>
                        ‹
                      </button>
                      <button type="button" disabled={i === previews.length - 1} aria-label={t('recuerdo_mover_despues')} onClick={() => moverFoto(i, 1)}>
                        ›
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <button type="button" className="sheet__photo-add" aria-label={t('recuerdo_agregar_fotos')} onClick={() => fileInputRef.current?.click()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
            {enCamino > 0 && (
              <span className="sheet__hint">{t('recuerdo_subiendo_progreso', listas, nuevas.length)}</span>
            )}
            {fallidas > 0 && <span className="sheet__hint">{t('recuerdo_fotos_fallidas', fallidas)}</span>}
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
                ? t('recuerdo_subiendo_fotos')
                : t('comun_guardando')
              : editando
                ? t('comun_guardar_cambios')
                : t('recuerdo_guardar_nuevo')}
          </button>

          {editando &&
            (confirmandoBorrado ? (
              <div className="sheet__confirmar">
                <p className="sheet__confirmar-texto">{t('recuerdo_confirmar_borrado', fotos.length)}</p>
                <div className="sheet__confirmar-acciones">
                  <button type="button" className="sheet__cancelar" onClick={() => setConfirmandoBorrado(false)}>
                    {t('comun_cancelar')}
                  </button>
                  <button type="button" className="sheet__borrar-confirmar" disabled={guardando} onClick={borrar}>
                    {guardando ? t('recuerdo_borrando') : t('recuerdo_confirmar_si')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="sheet__borrar" disabled={guardando} onClick={() => setConfirmandoBorrado(true)}>
                {t('recuerdo_borrar_boton')}
              </button>
            ))}
        </form>
      </div>
    </div>
  )
}
