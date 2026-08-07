import { useEffect, useMemo } from 'react'
import type { HitoDeHoy } from '../lib/duette'

interface CelebracionProps {
  hito: HitoDeHoy
  nombres: string
  onCerrar: () => void
}

/** Hand-rolled rather than pulled from a package: it's a handful of divs
 * falling, and this project has no build step to hide a dependency behind. */
const PAPELITOS = 44

const COLORES = ['var(--acento)', 'var(--acento-claro)', 'var(--acento-fuerte)', '#f5c86b', '#f0eaea']

/** Shown once, on the day a couple actually reaches something. Everything
 * about the timing lives in the caller — this only knows how to celebrate. */
export function Celebracion({ hito, nombres, onCerrar }: CelebracionProps) {
  // Fixed at mount: recomputing on every render would reshuffle the confetti
  // mid-fall.
  const papelitos = useMemo(
    () =>
      Array.from({ length: PAPELITOS }, (_, i) => ({
        izquierda: `${Math.random() * 100}%`,
        // Spread over a second and a half so it falls like confetti rather
        // than like a single curtain dropping.
        retraso: `${Math.random() * 1.5}s`,
        duracion: `${2.6 + Math.random() * 1.8}s`,
        giro: `${Math.random() * 360}deg`,
        color: COLORES[i % COLORES.length],
        ancho: `${6 + Math.random() * 5}px`,
        alto: `${10 + Math.random() * 8}px`,
      })),
    [],
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="celebracion" onClick={onCerrar}>
      {/* aria-hidden: the confetti is decoration, and a screen reader
          announcing forty-four empty divs is not a celebration. */}
      <div className="celebracion__papelitos" aria-hidden="true">
        {papelitos.map((p, i) => (
          <span
            key={i}
            className="celebracion__papelito"
            style={{
              left: p.izquierda,
              width: p.ancho,
              height: p.alto,
              background: p.color,
              animationDelay: p.retraso,
              animationDuration: p.duracion,
              ['--giro' as string]: p.giro,
            }}
          />
        ))}
      </div>

      <div className="celebracion__tarjeta" role="status" onClick={(e) => e.stopPropagation()}>
        <div className="celebracion__numero">{hito.numero}</div>
        <h2 className="celebracion__titulo">{hito.titulo}</h2>
        <p className="celebracion__texto">Hoy es el día, {nombres}.</p>
        <button type="button" className="celebracion__boton" onClick={onCerrar}>
          Festejar
        </button>
      </div>
    </div>
  )
}
