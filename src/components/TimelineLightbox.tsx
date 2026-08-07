import { useRef, useState } from 'react'
import type { PhotoSlot } from '../lib/duette'
import { useT } from '../lib/i18n/contexto'

/** How far a finger has to travel before letting go turns the page. Below
 * this the photo slides back, so a hesitant drag reads as "no". */
const UMBRAL = 40

/** Long enough to see the photo travel, short enough that flicking through a
 * recuerdo doesn't feel like waiting for each one. */
const MS_ANIMACION = 260

/** Pull past the first or last photo, damped. There is nothing to bring in
 * from beyond the edge, and letting the drag run free would promise a photo
 * that isn't there — but a completely rigid edge reads as a broken gesture,
 * so it gives a little. */
const RESISTENCIA = 0.25

interface TimelineLightboxProps {
  slots: PhotoSlot[]
  startIndex: number
  onClose: () => void
  onEditar: () => void
  /** Wording for the main action. Defaults to the timeline's. */
  etiquetaEditar?: string
  /** Shown only when given — the timeline deletes through its edit sheet. */
  onBorrar?: () => void
  /** Fires on every swipe or arrow, so a caller acting on "the photo being
   * looked at" doesn't keep acting on the one that was opened. */
  onIndice?: (i: number) => void
}

export function TimelineLightbox({
  slots,
  startIndex,
  onClose,
  onEditar,
  etiquetaEditar,
  onBorrar,
  onIndice,
}: TimelineLightboxProps) {
  const t = useT()
  const [i, setI] = useState(startIndex)
  /** Where the track sits right now, in px from centred. Follows the finger
   * while dragging, then animates to a neighbour or back to zero. */
  const [desplazamiento, setDesplazamiento] = useState(0)
  /** True while the track is travelling on its own. Turns the CSS transition
   * on, and locks out a second gesture until it lands. */
  const [animando, setAnimando] = useState(false)
  const pistaRef = useRef<HTMLDivElement>(null)
  const inicioX = useRef<number | null>(null)
  /** Read by the transition-end handler to know which photo to land on. 0
   * means the track was only springing back to where it started. */
  const direccion = useRef(0)
  /** The same value as `desplazamiento`, kept where the touch handlers can
   * read it without depending on a render having happened first. */
  const actual = useRef(0)

  function mover(px: number) {
    actual.current = px
    setDesplazamiento(px)
  }

  /** Sends the track to a neighbour, or back to centre when there isn't one. */
  function irA(dir: -1 | 1) {
    const destino = i + dir
    if (destino < 0 || destino >= slots.length) return volverAlCentro()
    direccion.current = dir
    setAnimando(true)
    // The track moves against the swipe: dragging left brings in the photo
    // on the right.
    mover(-dir * (pistaRef.current?.offsetWidth ?? window.innerWidth))
  }

  function volverAlCentro() {
    direccion.current = 0
    // Already there — no transition would fire, and waiting for one that
    // never comes would leave the track locked.
    if (actual.current === 0) return setAnimando(false)
    setAnimando(true)
    mover(0)
  }

  /** The photo has finished travelling: adopt it and put the track back at
   * centre in the same commit, so nothing is ever seen mid-jump. */
  function alTerminar(e: React.TransitionEvent<HTMLDivElement>) {
    // Only the track's own movement ends a page turn. Without this, any
    // transition added to something inside a pane later on would bubble up
    // here and silently advance the photo.
    if (e.target !== e.currentTarget) return
    const dir = direccion.current
    direccion.current = 0
    setAnimando(false)
    mover(0)
    if (!dir) return
    const destino = i + dir
    setI(destino)
    onIndice?.(destino)
  }

  function anterior() {
    if (!animando) irA(-1)
  }
  function siguiente() {
    if (!animando) irA(1)
  }

  function alTocar(e: React.TouchEvent) {
    if (animando) return
    inicioX.current = e.touches[0].clientX
  }

  function alArrastrar(e: React.TouchEvent) {
    if (inicioX.current === null) return
    let delta = e.touches[0].clientX - inicioX.current
    if ((delta > 0 && i === 0) || (delta < 0 && i === slots.length - 1)) delta *= RESISTENCIA
    mover(delta)
  }

  function alSoltar() {
    if (inicioX.current === null) return
    inicioX.current = null
    const delta = actual.current
    if (delta > UMBRAL) irA(-1)
    else if (delta < -UMBRAL) irA(1)
    else volverAlCentro()
  }

  // Only ever three: the one being looked at and whichever can be dragged in
  // from either side. Keyed by their real position, so moving one along
  // reuses the two that were already decoded instead of reloading them.
  const visibles = [i - 1, i, i + 1]
  const slotActual = slots[i]

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button type="button" className="lightbox-close" aria-label={t('comun_cerrar')} onClick={onClose}>
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

      <div
        className="lightbox-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={alTocar}
        onTouchMove={alArrastrar}
        onTouchEnd={alSoltar}
        onTouchCancel={alSoltar}
      >
        <div
          className="lightbox-pista"
          ref={pistaRef}
          style={{
            // -100% puts the middle pane on screen; the px offset is the
            // finger, or the animation on its way to the next one.
            transform: `translate3d(calc(-100% + ${desplazamiento}px), 0, 0)`,
            transition: animando ? `transform ${MS_ANIMACION}ms cubic-bezier(0.22, 0.61, 0.36, 1)` : 'none',
          }}
          onTransitionEnd={alTerminar}
        >
          {visibles.map((n) => {
            const slot = slots[n]
            return (
              <div className="lightbox-pane" key={n}>
                {slot?.src && (
                  <div className="lightbox-media">
                    <img src={slot.src} alt="" className="lightbox-img" draggable={false} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {slots.length > 1 && i > 0 && (
          <button type="button" className="lightbox-arrow lightbox-arrow--prev" aria-label={t('lightbox_foto_anterior')} onClick={anterior}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {slots.length > 1 && i < slots.length - 1 && (
          <button type="button" className="lightbox-arrow lightbox-arrow--next" aria-label={t('lightbox_foto_siguiente')} onClick={siguiente}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      <div className="lightbox-acciones">
        {/* Any moodboard slot saved from Pinterest, not just a video's cover
            frame — this points back to the pin itself, photo or video. A
            link and not a button: it leaves the app, and should behave like
            it (long-press, open in a tab). */}
        {slotActual?.urlOrigen && (
          <a
            className="lightbox-pinterest"
            href={slotActual.urlOrigen}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.63 7.86 6.35 9.32-.09-.79-.16-2.01.03-2.87.18-.78 1.16-4.95 1.16-4.95s-.3-.59-.3-1.46c0-1.37.79-2.39 1.78-2.39.84 0 1.24.63 1.24 1.38 0 .84-.54 2.1-.81 3.27-.23.98.49 1.78 1.46 1.78 1.75 0 3.1-1.85 3.1-4.52 0-2.36-1.7-4.02-4.12-4.02-2.81 0-4.46 2.11-4.46 4.28 0 .85.33 1.76.73 2.25.08.1.09.18.07.28-.08.31-.25 1-.28 1.14-.05.18-.15.22-.34.13-1.26-.59-2.05-2.43-2.05-3.91 0-3.19 2.32-6.12 6.68-6.12 3.51 0 6.24 2.5 6.24 5.84 0 3.48-2.2 6.29-5.25 6.29-1.03 0-1.99-.53-2.32-1.16 0 0-.51 1.93-.63 2.41-.23.88-.85 1.98-1.26 2.65.95.29 1.95.45 3 .45 5.52 0 10-4.48 10-10S17.52 2 12 2Z" />
            </svg>
            {t('insp_ver_en_pinterest')}
          </a>
        )}
        <button
          type="button"
          className="lightbox-edit"
          onClick={(e) => {
            e.stopPropagation()
            onEditar()
          }}
        >
          {etiquetaEditar ?? t('lightbox_editar_recuerdo')}
        </button>
        {onBorrar && (
          <button
            type="button"
            className="lightbox-edit lightbox-edit--borrar"
            onClick={(e) => {
              e.stopPropagation()
              onBorrar()
            }}
          >
            {t('comun_borrar')}
          </button>
        )}
      </div>
    </div>
  )
}
