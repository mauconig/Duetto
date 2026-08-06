import type { KeyboardEvent } from 'react'
import { RULETA_COLORES, RULETA_TEXTO, ruedaFondo, truncarEtiqueta } from '../lib/duette'

interface RouletteProps {
  ideas: string[]
  rotacion: number
  girando: boolean
  resultado: string | null
  nuevaIdea: string
  onGirar: () => void
  onCambiarNuevaIdea: (v: string) => void
  onAgregarIdea: () => void
  onBorrarIdea: (index: number) => void
}

export function Roulette({
  ideas,
  rotacion,
  girando,
  resultado,
  nuevaIdea,
  onGirar,
  onCambiarNuevaIdea,
  onAgregarIdea,
  onBorrarIdea,
}: RouletteProps) {
  const seg = 360 / Math.max(ideas.length, 1)

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') onAgregarIdea()
  }

  return (
    <div className="screen">
      <div>
        <h2>Ruleta de citas</h2>
        <div className="page-subtitle">Sus ideas deciden la próxima cita</div>
      </div>

      <div className="wheel">
        <div className="wheel__pointer" />
        <div className="wheel__disc" style={{ background: ruedaFondo(ideas), transform: `rotate(${rotacion}deg)` }}>
          {ideas.map((t, i) => (
            <span
              key={i}
              className="wheel__label"
              style={{ transform: `rotate(${(i + 0.5) * seg}deg) translateY(-102px)`, color: RULETA_TEXTO[i % 6] }}
            >
              {truncarEtiqueta(t)}
            </span>
          ))}
        </div>
        <div className="wheel__hub">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--acento)" stroke="none">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </div>
      </div>

      <button
        type="button"
        className="spin-btn"
        onClick={onGirar}
        disabled={girando || ideas.length < 2}
        style={{ opacity: girando ? 0.6 : 1 }}
      >
        {girando ? 'Girando…' : 'Girar la ruleta'}
      </button>

      {resultado && (
        <div className="result-card">
          <div className="result-card__kicker">Esta vez toca</div>
          <div className="result-card__title">{resultado}</div>
        </div>
      )}

      <div>
        <div className="ideas-heading">IDEAS EN JUEGO · {ideas.length}</div>
        <div className="ideas-panel">
          {ideas.map((t, i) => (
            <div className="idea-row" key={i}>
              <div className="idea-row__dot" style={{ background: RULETA_COLORES[i % 6] }} />
              <div className="idea-row__text">{t}</div>
              <button type="button" className="idea-row__delete" onClick={() => onBorrarIdea(i)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
          <div className="idea-input-row">
            <input
              placeholder="Nueva idea de cita"
              value={nuevaIdea}
              onChange={(e) => onCambiarNuevaIdea(e.target.value)}
              onKeyDown={onKeyDown}
              className="idea-input"
            />
            <button type="button" className="idea-add-btn" onClick={onAgregarIdea}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
