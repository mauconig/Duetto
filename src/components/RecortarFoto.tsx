import { useEffect, useRef, useState } from 'react'
import { OPCIONES_BITMAP } from '../lib/photoResize'
import { useT } from '../lib/i18n/contexto'

/** What the avatar is finally stored at. Drawn at 48px and never zoomed, so
 * this is already generous — it exists so a face still holds up on a screen
 * that decides to render it bigger. */
const LADO_SALIDA = 512

/** The square the photo is framed in, on screen. */
const VISOR = 260

const ZOOM_MAX = 4

interface RecortarFotoProps {
  archivo: File
  onListo: (recorte: Blob) => void
  onCancelar: () => void
}

/** Picks which part of a photo becomes the avatar.
 *
 * Without this the circle just takes the middle, which is the wrong part of
 * most photos people have of themselves — a face is rarely dead centre of a
 * portrait, and never of a group shot. */
export function RecortarFoto({ archivo, onListo, onCancelar }: RecortarFotoProps) {
  const t = useT()
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Made once and revoked on the way out. Built in render it would mint a
  // new URL on every pan frame and never let go of any of them.
  const [url] = useState(() => URL.createObjectURL(archivo))
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [guardando, setGuardando] = useState(false)

  /** Live pointers on the frame. One pans, two pinch. */
  const punteros = useRef(new Map<number, { x: number; y: number }>())
  const pellizco = useRef<{ distancia: number; zoom: number } | null>(null)

  useEffect(() => {
    let vivo = true
    let creado: ImageBitmap | null = null
    // from-image so a photo taken sideways is framed the way it looks in the
    // gallery, not the way its pixels happen to be stored.
    createImageBitmap(archivo, OPCIONES_BITMAP)
      .then((bm) => {
        if (!vivo) return bm.close()
        creado = bm
        setBitmap(bm)
      })
      .catch(() => vivo && setError(t('recorte_error_abrir')))
    return () => {
      vivo = false
      creado?.close()
    }
    // `t` only feeds the error branch; re-decoding the bitmap on a language
    // change would be wasted work for something that never touches pixels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  /** Scale at which the photo exactly covers the frame — the floor, so there
   * is never a gap inside the circle whatever the aspect ratio. */
  const base = bitmap ? Math.max(VISOR / bitmap.width, VISOR / bitmap.height) : 1
  const escala = base * zoom
  const ancho = bitmap ? bitmap.width * escala : 0
  const alto = bitmap ? bitmap.height * escala : 0

  /** Keeps the photo covering the frame: pan and zoom can move it, never off
   * the edge. Recomputed on every change because the limits move with zoom. */
  function acotar(x: number, y: number, w: number, h: number) {
    return { x: Math.min(0, Math.max(VISOR - w, x)), y: Math.min(0, Math.max(VISOR - h, y)) }
  }

  // Re-centred whenever the zoom changes so the photo can't be left hanging
  // outside the frame by a slider drag.
  useEffect(() => {
    if (!bitmap) return
    setOffset((prev) => acotar(prev.x, prev.y, bitmap.width * base * zoom, bitmap.height * base * zoom))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, bitmap, base])

  // Centred to start: the middle is the wrong guess often enough to need
  // this screen, but it is still the right guess to open on.
  useEffect(() => {
    if (bitmap) setOffset({ x: (VISOR - bitmap.width * base) / 2, y: (VISOR - bitmap.height * base) / 2 })
  }, [bitmap, base])

  function alPresionar(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()]
      pellizco.current = { distancia: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }

  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    const previo = punteros.current.get(e.pointerId)
    if (!previo) return
    const actual = { x: e.clientX, y: e.clientY }
    punteros.current.set(e.pointerId, actual)

    if (punteros.current.size >= 2 && pellizco.current) {
      const [a, b] = [...punteros.current.values()]
      const distancia = Math.hypot(a.x - b.x, a.y - b.y)
      const siguiente = (pellizco.current.zoom * distancia) / pellizco.current.distancia
      setZoom(Math.min(ZOOM_MAX, Math.max(1, siguiente)))
      return
    }

    setOffset((prev) => acotar(prev.x + (actual.x - previo.x), prev.y + (actual.y - previo.y), ancho, alto))
  }

  function alSoltar(e: React.PointerEvent<HTMLDivElement>) {
    punteros.current.delete(e.pointerId)
    if (punteros.current.size < 2) pellizco.current = null
  }

  async function confirmar() {
    if (!bitmap || guardando) return
    setGuardando(true)
    try {
      // What the frame shows, mapped back onto the source. offset is negative
      // as the photo is dragged left and up, so negating gives the corner of
      // the visible region in screen pixels; dividing by the scale puts it
      // back in the photo's own.
      const lienzo = document.createElement('canvas')
      lienzo.width = LADO_SALIDA
      lienzo.height = LADO_SALIDA
      const ctx = lienzo.getContext('2d')!
      ctx.drawImage(
        bitmap,
        -offset.x / escala,
        -offset.y / escala,
        VISOR / escala,
        VISOR / escala,
        0,
        0,
        LADO_SALIDA,
        LADO_SALIDA,
      )
      const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/webp', 0.85))
      if (!blob) throw new Error(t('recorte_error_preparar'))
      onListo(blob)
    } catch {
      setError(t('recorte_error_recortar'))
      setGuardando(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancelar}>
      <div className="recorte" onClick={(e) => e.stopPropagation()}>
        <h3 className="recorte__titulo">{t('recorte_titulo')}</h3>

        {error ? (
          <p className="recorte__error">{error}</p>
        ) : (
          <>
            <div
              className="recorte__visor"
              style={{ width: VISOR, height: VISOR }}
              onPointerDown={alPresionar}
              onPointerMove={alMover}
              onPointerUp={alSoltar}
              onPointerCancel={alSoltar}
            >
              {bitmap && (
                <img
                  className="recorte__foto"
                  src={url}
                  alt=""
                  draggable={false}
                  style={{
                    width: ancho,
                    height: alto,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                />
              )}
              {/* The circle is a hole punched in a solid layer rather than a
                  ring drawn on top, so what falls outside is visibly not
                  part of the result. */}
              <div className="recorte__mascara" />
            </div>

            <input
              className="recorte__zoom"
              type="range"
              min={1}
              max={ZOOM_MAX}
              step={0.01}
              value={zoom}
              aria-label={t('recorte_acercar')}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
            <p className="recorte__ayuda">{t('recorte_ayuda')}</p>
          </>
        )}

        <div className="recorte__acciones">
          <button type="button" className="sheet__cancelar" onClick={onCancelar}>
            {t('comun_cancelar')}
          </button>
          <button type="button" className="sheet__submit" onClick={confirmar} disabled={!bitmap || guardando || !!error}>
            {guardando ? t('comun_guardando') : t('recorte_usar_foto')}
          </button>
        </div>
      </div>
    </div>
  )
}
