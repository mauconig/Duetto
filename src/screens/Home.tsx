import { ImageSlot } from '../components/ImageSlot'
import type { Album, Articulo } from '../types'
import type { Edad, Hito, PhotoSlot } from '../lib/duette'
import { formatFechaEntrada, pad, photoSlots } from '../lib/duette'

interface HomeProps {
  nombres: string
  fechaHoy: string
  inicial1: string
  inicial2: string
  fechaInicioTexto: string
  edad: Edad
  hito: Hito
  ultimoAlbum: Album
  albumFoto: PhotoSlot | undefined
  articuloDelDia: Articulo
  recuerdo: Album | null
  ideaSugerida: string | null
  onIrRuleta: () => void
  onIrAlbumes: () => void
  onIrArticulos: () => void
  onAbrirRecuerdo: (recuerdo: Album) => void
}

export function Home({
  nombres,
  fechaHoy,
  inicial1,
  inicial2,
  fechaInicioTexto,
  edad,
  hito,
  ultimoAlbum,
  albumFoto,
  articuloDelDia,
  recuerdo,
  ideaSugerida,
  onIrRuleta,
  onIrAlbumes,
  onIrArticulos,
  onAbrirRecuerdo,
}: HomeProps) {
  const recuerdoFoto = recuerdo ? photoSlots(recuerdo)[0] : undefined

  return (
    <div className="screen">
      <div className="topbar">
        <div>
          <div className="topbar__date">{fechaHoy}</div>
          <div className="topbar__greeting">Hola, {nombres}</div>
        </div>
        <div className="avatar-badge">
          {inicial1}
          {inicial2}
        </div>
      </div>

      <div className="hero-card">
        <div className="hero-card__decor hero-card__decor--a" />
        <div className="hero-card__decor hero-card__decor--b" />
        <div className="hero-card__label">Juntos desde el {fechaInicioTexto}</div>
        <div className="hero-card__countdown">
          <div className="hero-card__unit">
            <div className="hero-card__num">{pad(edad.anios)}</div>
            <div className="hero-card__unit-label">años</div>
          </div>
          <div className="hero-card__colon">:</div>
          <div className="hero-card__unit">
            <div className="hero-card__num">{pad(edad.meses)}</div>
            <div className="hero-card__unit-label">meses</div>
          </div>
          <div className="hero-card__colon">:</div>
          <div className="hero-card__unit">
            <div className="hero-card__num">{pad(edad.dias)}</div>
            <div className="hero-card__unit-label">días</div>
          </div>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none" className="hero-card__heart">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </div>
      </div>

      <div className="milestone-card">
        <div className="milestone-card__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b03246" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 5.2A2.2 2.2 0 0 0 17.8 3H6.2A2.2 2.2 0 0 0 4 5.2v13.6A2.2 2.2 0 0 0 6.2 21h11.6a2.2 2.2 0 0 0 2.2-2.2z" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M4 9h16" />
          </svg>
        </div>
        <div className="milestone-card__body">
          <div className="milestone-card__kicker">Próximo hito</div>
          <div className="milestone-card__title">{hito.titulo}</div>
          <div className="milestone-card__track">
            <div className="milestone-card__fill" style={{ width: hito.progreso }} />
          </div>
        </div>
        <div className="milestone-card__days">
          <div className="milestone-card__days-num">{hito.diasNum}</div>
          <div className="milestone-card__days-label">{hito.diasLabel}</div>
        </div>
      </div>

      <button type="button" className="cta-button" onClick={onIrRuleta}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 2v7.5" />
          <path d="m19 17-4.9-2.8" />
          <path d="m5 17 4.9-2.8" />
        </svg>
        Girar la ruleta de citas
      </button>

      <div className="grid-2">
        <div className="mini-card mini-card--album" onClick={onIrAlbumes} role="button">
          <div className="mini-card__image">
            {albumFoto ? (
              <ImageSlot id={albumFoto.id} src={albumFoto.src} shape="rect" placeholder="" />
            ) : (
              <div className="mini-card__fallback" style={{ background: ultimoAlbum.fondo }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </div>
            )}
            <div className="mini-card__overlay">
              <div className="mini-card__overlay-kicker">Último álbum</div>
              <div className="mini-card__overlay-meta">{formatFechaEntrada(ultimoAlbum)}</div>
            </div>
          </div>
        </div>
        <div className="mini-card mini-card--article" onClick={onIrArticulos} role="button">
          <span className="tag-pill">Para hoy</span>
          <div className="mini-card__title mini-card__title--flex">{articuloDelDia.titulo}</div>
          <div className="mini-card__meta">{articuloDelDia.min} min de lectura</div>
        </div>
      </div>

      {recuerdo && (
        <div className="memory-card" onClick={() => onAbrirRecuerdo(recuerdo)} role="button">
          <div className="memory-card__photo">
            {recuerdoFoto ? (
              <ImageSlot id={recuerdoFoto.id} src={recuerdoFoto.src} shape="rect" placeholder="" />
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
              <div className="memory-card__kicker">Recuerdo del día</div>
              <div className="memory-card__fecha">{formatFechaEntrada(recuerdo)}</div>
            </div>
          </div>
        </div>
      )}

      {ideaSugerida && (
        <div className="idea-teaser-card" onClick={onIrRuleta} role="button">
          <div className="idea-teaser-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b03246" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 2v7.5" />
              <path d="m19 17-4.9-2.8" />
              <path d="m5 17 4.9-2.8" />
            </svg>
          </div>
          <div className="idea-teaser-card__body">
            <div className="idea-teaser-card__kicker">Idea para la próxima cita</div>
            <div className="idea-teaser-card__text">{ideaSugerida}</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d3adaf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      )}
    </div>
  )
}
