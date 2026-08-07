import { Avatar } from '../components/Avatar'
import { ImageSlot } from '../components/ImageSlot'
import type { Album } from '../types'
import type { Edad, Hito, HitoDeHoy, PhotoSlot } from '../lib/duette'
import { formatFechaEntrada, pad, photoSlots } from '../lib/duette'
import { useIdiomaContexto } from '../lib/i18n/contexto'

interface HomeProps {
  nombres: string
  fechaHoy: string
  inicial1: string
  inicial2: string
  /** Null when the person has no photo, which is when the initial shows. */
  imagenPropia: string | null
  imagenPareja: string | null
  fechaInicioTexto: string
  edad: Edad
  hito: Hito
  /** Set only on the day a milestone lands, when the countdown to the next
   * one is beside the point. */
  hitoHoy: HitoDeHoy | null
  /** Undefined until the couple saves their first memory. */
  ultimoAlbum: Album | undefined
  albumFoto: PhotoSlot | undefined
  numInspiraciones: number
  /** A reference from the board, picked once a day. Undefined while the
   * board is still loading and when it has nothing in it. */
  inspiracionFoto: PhotoSlot | undefined
  recuerdo: Album | null
  ideaSugerida: string | null
  onIrRuleta: () => void
  onIrAlbumes: () => void
  onIrInspiracion: () => void
  onAbrirRecuerdo: (recuerdo: Album) => void
}

export function Home({
  nombres,
  fechaHoy,
  inicial1,
  inicial2,
  imagenPropia,
  imagenPareja,
  fechaInicioTexto,
  edad,
  hito,
  hitoHoy,
  ultimoAlbum,
  albumFoto,
  numInspiraciones,
  inspiracionFoto,
  recuerdo,
  ideaSugerida,
  onIrRuleta,
  onIrAlbumes,
  onIrInspiracion,
  onAbrirRecuerdo,
}: HomeProps) {
  const { t, resuelto } = useIdiomaContexto()
  const recuerdoFoto = recuerdo ? photoSlots(recuerdo)[0] : undefined
  const tituloHito = hitoHoy
    ? hitoHoy.tipo === 'aniversario'
      ? t('hito_titulo_aniversario', hitoHoy.numero)
      : t('hito_titulo_cumplemes', hitoHoy.numero)
    : hito.tipo === 'aniversario'
      ? t('hito_titulo_aniversario', hito.numero)
      : t('hito_titulo_cumplemes', hito.numero)

  return (
    <div className="screen">
      <div className="topbar">
        <div>
          <div className="topbar__date">{fechaHoy}</div>
          <div className="topbar__greeting">{t('inicio_saludo', nombres)}</div>
        </div>
        {/* Two overlapping faces when there are photos, the initials badge
            when there aren't. A half-photo half-letter pair looked like a
            loading state that never finished, so it's one or the other. */}
        {imagenPropia || imagenPareja ? (
          <div className="avatar-par">
            <Avatar url={imagenPropia} inicial={inicial1} />
            <Avatar url={imagenPareja} inicial={inicial2} />
          </div>
        ) : (
          <div className="avatar-badge">
            {inicial1}
            {inicial2}
          </div>
        )}
      </div>

      <div className="hero-card">
        <div className="hero-card__decor hero-card__decor--a" />
        <div className="hero-card__decor hero-card__decor--b" />
        <div className="hero-card__label">{t('inicio_juntos_desde', fechaInicioTexto)}</div>
        <div className="hero-card__countdown">
          <div className="hero-card__unit">
            <div className="hero-card__num">{pad(edad.anios)}</div>
            <div className="hero-card__unit-label">{t('inicio_unidad_anios')}</div>
          </div>
          <div className="hero-card__colon">:</div>
          <div className="hero-card__unit">
            <div className="hero-card__num">{pad(edad.meses)}</div>
            <div className="hero-card__unit-label">{t('inicio_unidad_meses')}</div>
          </div>
          <div className="hero-card__colon">:</div>
          <div className="hero-card__unit">
            <div className="hero-card__num">{pad(edad.dias)}</div>
            <div className="hero-card__unit-label">{t('inicio_unidad_dias')}</div>
          </div>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none" className="hero-card__heart">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </div>
      </div>

      <div className="milestone-card">
        <div className="milestone-card__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acento)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 5.2A2.2 2.2 0 0 0 17.8 3H6.2A2.2 2.2 0 0 0 4 5.2v13.6A2.2 2.2 0 0 0 6.2 21h11.6a2.2 2.2 0 0 0 2.2-2.2z" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M4 9h16" />
          </svg>
        </div>
        <div className="milestone-card__body">
          <div className="milestone-card__kicker">{hitoHoy ? t('inicio_es_hoy') : t('inicio_proximo_hito')}</div>
          <div className="milestone-card__title">{tituloHito}</div>
          <div className="milestone-card__track">
            <div className="milestone-card__fill" style={{ width: hitoHoy ? '100%' : hito.progreso }} />
          </div>
        </div>
        {/* On the day itself the countdown is the wrong thing to show: the
            next milestone is a year or a month away and saying so is a way of
            missing the point. */}
        {hitoHoy ? (
          <div className="milestone-card__days milestone-card__days--hoy">
            <div className="milestone-card__days-num">🎉</div>
          </div>
        ) : (
          <div className="milestone-card__days">
            <div className="milestone-card__days-num">{hito.diasNum}</div>
            <div className="milestone-card__days-label">{t('hito_dias_unidad', hito.diasNum)}</div>
          </div>
        )}
      </div>

      <button type="button" className="cta-button" onClick={onIrRuleta}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 2v7.5" />
          <path d="m19 17-4.9-2.8" />
          <path d="m5 17 4.9-2.8" />
        </svg>
        {t('inicio_girar_ruleta')}
      </button>

      <div className="grid-2">
        <div
          className="mini-card mini-card--album"
          onClick={() => (ultimoAlbum ? onAbrirRecuerdo(ultimoAlbum) : onIrAlbumes())}
          role="button"
        >
          <div className="mini-card__image">
            {albumFoto ? (
              <ImageSlot src={albumFoto.miniatura} shape="rect" placeholder="" />
            ) : (
              <div className="mini-card__fallback" style={{ background: ultimoAlbum?.fondo ?? 'linear-gradient(135deg, #cf6a78, #a32f42)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </div>
            )}
            <div className="mini-card__overlay">
              <div className="mini-card__overlay-kicker">{ultimoAlbum ? t('inicio_ultimo_recuerdo') : t('nav_recuerdos')}</div>
              <div className="mini-card__overlay-meta">
                {ultimoAlbum ? formatFechaEntrada(ultimoAlbum, resuelto) : t('inicio_sumar_primer_recuerdo')}
              </div>
            </div>
          </div>
        </div>
        {/* One of the saved references, chosen per day, as the card itself.
            The board is made of pictures, so a card about it that shows none
            was the odd one out on this screen. Falls back to words only when
            there is genuinely nothing to show — every reference has a photo,
            so no photo means an empty board. */}
        <div
          className={`mini-card ${inspiracionFoto ? 'mini-card--foto' : 'mini-card--article'}`}
          onClick={onIrInspiracion}
          role="button"
        >
          {inspiracionFoto ? (
            <div className="mini-card__image">
              <ImageSlot src={inspiracionFoto.miniatura} shape="rect" placeholder="" />
              <div className="mini-card__overlay">
                <div className="mini-card__overlay-kicker">{t('nav_inspiracion')}</div>
                <div className="mini-card__overlay-meta">{t('inicio_insp_guardadas', numInspiraciones)}</div>
              </div>
            </div>
          ) : (
            <>
              <span className="tag-pill">{t('nav_inspiracion')}</span>
              <div className="mini-card__title mini-card__title--flex">{t('inicio_insp_vacio_titulo')}</div>
              <div className="mini-card__meta">{t('inicio_insp_vacio_texto')}</div>
            </>
          )}
        </div>
      </div>

      {recuerdo && (
        <div className="memory-card" onClick={() => onAbrirRecuerdo(recuerdo)} role="button">
          <div className="memory-card__photo">
            {recuerdoFoto ? (
              <ImageSlot src={recuerdoFoto.miniatura} shape="rect" placeholder="" />
            ) : (
              <div className="memory-card__fallback" style={{ background: recuerdo.fondo }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </div>
            )}
            <div className="memory-card__overlay">
              <div className="memory-card__kicker">{t('inicio_recuerdo_del_dia')}</div>
              <div className="memory-card__fecha">{formatFechaEntrada(recuerdo, resuelto)}</div>
            </div>
          </div>
        </div>
      )}

      {ideaSugerida && (
        <div className="idea-teaser-card" onClick={onIrRuleta} role="button">
          <div className="idea-teaser-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--acento)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 2v7.5" />
              <path d="m19 17-4.9-2.8" />
              <path d="m5 17 4.9-2.8" />
            </svg>
          </div>
          <div className="idea-teaser-card__body">
            <div className="idea-teaser-card__kicker">{t('inicio_idea_kicker')}</div>
            <div className="idea-teaser-card__text">{ideaSugerida}</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--icono-tenue)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      )}
    </div>
  )
}
