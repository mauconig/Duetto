import { useEffect } from 'react'
import type { Album } from '../types'
import { formatFechaEntrada, photoSlots, sortByFecha } from '../lib/duette'

interface SharedPhotosSheetProps {
  fotos: File[]
  albumes: Album[]
  onNuevo: () => void
  onExistente: (entry: Album) => void
  onInspiracion: () => void
  onDescartar: () => void
}

/** Shown when photos arrive from Android's share sheet. Three destinations:
 * a new recuerdo, one that already exists, or the inspiración board — which
 * is the point of sharing from Pinterest or Instagram rather than from the
 * camera roll. Newest entries first, since a photo being shared now almost
 * always belongs to something recent. */
export function SharedPhotosSheet({
  fotos,
  albumes,
  onNuevo,
  onExistente,
  onInspiracion,
  onDescartar,
}: SharedPhotosSheetProps) {
  const recientes = sortByFecha(albumes).slice(-6).reverse()

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const cuantas = fotos.length === 1 ? 'Llegó 1 foto' : `Llegaron ${fotos.length} fotos`

  return (
    <div className="sheet-backdrop" onClick={onDescartar}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{cuantas}</h3>
          <button type="button" className="sheet__close" aria-label="Descartar" onClick={onDescartar}>
            ×
          </button>
        </div>
        <div className="sheet__form">
          <p className="sheet__hint">¿Dónde las guardamos?</p>

          <button type="button" className="compartir-opcion compartir-opcion--nueva" onClick={onNuevo}>
            <div className="compartir-opcion__icono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </div>
            <span className="compartir-opcion__titulo">En un recuerdo nuevo</span>
          </button>

          <button type="button" className="compartir-opcion" onClick={onInspiracion}>
            <div className="compartir-opcion__icono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z" />
              </svg>
            </div>
            <span className="compartir-opcion__texto">
              <span className="compartir-opcion__titulo">En inspiración</span>
              <span className="compartir-opcion__fecha">Para copiarla más adelante</span>
            </span>
          </button>

          {recientes.length > 0 && (
            <>
              <div className="compartir-separador">o sumalas a uno que ya existe</div>
              <div className="compartir-lista">
                {recientes.map((entry) => {
                  const portada = photoSlots(entry)[0]
                  return (
                    <button type="button" className="compartir-opcion" key={entry.id} onClick={() => onExistente(entry)}>
                      {portada?.miniatura ? (
                        <img className="compartir-opcion__foto" src={portada.miniatura} alt="" />
                      ) : (
                        <div className="compartir-opcion__foto" style={{ background: entry.fondo }} />
                      )}
                      <span className="compartir-opcion__texto">
                        <span className="compartir-opcion__titulo">{entry.nota || 'Sin nota'}</span>
                        <span className="compartir-opcion__fecha">{formatFechaEntrada(entry)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <button type="button" className="sheet__cancelar sheet__cancelar--ancho" onClick={onDescartar}>
            Descartar
          </button>
        </div>
      </div>
    </div>
  )
}
