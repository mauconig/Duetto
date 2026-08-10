import { useEffect, useMemo, useState } from 'react'
import type { Album } from '../types'
import type { Categoria } from '../lib/api'
import { formatFechaEntrada, photoSlots, sortByFecha } from '../lib/duette'
import { useIdiomaContexto } from '../lib/i18n/contexto'

interface SharedPhotosSheetProps {
  fotos: File[]
  albumes: Album[]
  categorias: Categoria[]
  /** Returns the carpeta so it can be filed into right away, or null if
   * creating it failed. */
  onCrearCarpeta: (nombre: string) => Promise<Categoria | null>
  onNuevo: () => void
  onExistente: (entry: Album) => void
  onInspiracion: (categoriaId: string | null) => void
  onDescartar: () => void
  /** Skips the "where do we save these?" question and goes straight to
   * picking a carpeta. Set when the photo got here by being pasted into the
   * moodboard: someone standing on the moodboard, pasting a link, has already
   * answered that question by being there. */
  yaEnMoodboard?: boolean
}

/** Shown when photos arrive from Android's share sheet. Three destinations:
 * a new recuerdo, one that already exists, or the inspiración board — which
 * is the point of sharing from Pinterest or Instagram rather than from the
 * camera roll. Newest entries first, since a photo being shared now almost
 * always belongs to something recent. */
export function SharedPhotosSheet({
  fotos,
  albumes,
  categorias,
  onCrearCarpeta,
  onNuevo,
  onExistente,
  onInspiracion,
  onDescartar,
  yaEnMoodboard = false,
}: SharedPhotosSheetProps) {
  const { t, resuelto } = useIdiomaContexto()
  const recientes = sortByFecha(albumes).slice(-6).reverse()
  // Second step: which carpeta the photo goes into. Asking this used to be
  // skipped because the question arrived before the photo did — here the
  // photo is on screen while it's asked, so it's a question about something
  // the user can see.
  //
  // A pasted link starts here, because the first question is already answered
  // by where the person was standing when they pasted.
  const [eligiendoCarpeta, setEligiendoCarpeta] = useState(yaEnMoodboard)
  const [nombreNuevo, setNombreNuevo] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Revoked on unmount: an object URL that outlives the sheet keeps the whole
  // file alive in memory.
  const vistaPrevia = useMemo(() => (fotos[0] ? URL.createObjectURL(fotos[0]) : null), [fotos])
  useEffect(() => () => {
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
  }, [vistaPrevia])

  async function confirmarCarpetaNueva() {
    const nombre = nombreNuevo?.trim()
    if (!nombre || creando) return
    setCreando(true)
    const carpeta = await onCrearCarpeta(nombre)
    setCreando(false)
    // A failure leaves the field as it was, so the name isn't lost and the
    // error banner on the board explains itself.
    if (carpeta) onInspiracion(carpeta.id)
  }

  const cuantas = t('compartir_cuantas', fotos.length)

  if (eligiendoCarpeta) {
    return (
      <div className="sheet-backdrop" onClick={onDescartar}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet__handle" />
          <div className="sheet__header">
            <h3>{t('compartir_que_carpeta')}</h3>
            {/* There's only something to go back *to* when the destination was
                actually asked. A pasted link skipped that step, so here the
                same button is the way out of the sheet entirely. */}
            <button
              type="button"
              className="sheet__close"
              aria-label={yaEnMoodboard ? t('compartir_descartar') : t('comun_volver')}
              onClick={() => (yaEnMoodboard ? onDescartar() : setEligiendoCarpeta(false))}
            >
              ×
            </button>
          </div>
          <div className="sheet__form">
            {vistaPrevia && <img className="compartir-vista" src={vistaPrevia} alt="" />}

            {nombreNuevo === null ? (
              <button
                type="button"
                className="compartir-opcion compartir-opcion--nueva"
                onClick={() => setNombreNuevo('')}
              >
                <div className="compartir-opcion__icono">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </div>
                <span className="compartir-opcion__titulo">{t('insp_nueva_carpeta')}</span>
              </button>
            ) : (
              <div className="compartir-nueva">
                <input
                  className="compartir-nueva__input"
                  autoFocus
                  placeholder={t('compartir_nombre_carpeta_placeholder')}
                  value={nombreNuevo}
                  maxLength={40}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmarCarpetaNueva()
                    if (e.key === 'Escape') setNombreNuevo(null)
                  }}
                />
                <button
                  type="button"
                  className="compartir-nueva__ok"
                  disabled={!nombreNuevo.trim() || creando}
                  onClick={confirmarCarpetaNueva}
                >
                  {creando ? t('compartir_creando') : t('compartir_crear_y_guardar')}
                </button>
              </div>
            )}

            {categorias.length > 0 && (
              <div className="compartir-lista">
                {categorias.map((c) => (
                  <button
                    type="button"
                    className="compartir-opcion"
                    key={c.id}
                    onClick={() => onInspiracion(c.id)}
                  >
                    <span className="compartir-opcion__titulo">{c.nombre}</span>
                  </button>
                ))}
              </div>
            )}

            <button type="button" className="sheet__cancelar sheet__cancelar--ancho" onClick={() => onInspiracion(null)}>
              {t('compartir_sin_carpeta')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sheet-backdrop" onClick={onDescartar}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{cuantas}</h3>
          <button type="button" className="sheet__close" aria-label={t('compartir_descartar')} onClick={onDescartar}>
            ×
          </button>
        </div>
        <div className="sheet__form">
          <p className="sheet__hint">{t('compartir_donde_guardamos')}</p>

          <button type="button" className="compartir-opcion compartir-opcion--nueva" onClick={onNuevo}>
            <div className="compartir-opcion__icono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </div>
            <span className="compartir-opcion__titulo">{t('compartir_en_recuerdo_nuevo')}</span>
          </button>

          <button type="button" className="compartir-opcion" onClick={() => setEligiendoCarpeta(true)}>
            <div className="compartir-opcion__icono">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z" />
              </svg>
            </div>
            <span className="compartir-opcion__texto">
              <span className="compartir-opcion__titulo">{t('compartir_en_inspiracion')}</span>
              <span className="compartir-opcion__fecha">{t('compartir_para_copiar_mas_adelante')}</span>
            </span>
          </button>

          {recientes.length > 0 && (
            <>
              <div className="compartir-separador">{t('compartir_o_sumalas')}</div>
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
                        <span className="compartir-opcion__titulo">{entry.nota || t('compartir_sin_nota')}</span>
                        <span className="compartir-opcion__fecha">{formatFechaEntrada(entry, resuelto)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <button type="button" className="sheet__cancelar sheet__cancelar--ancho" onClick={onDescartar}>
            {t('compartir_descartar')}
          </button>
        </div>
      </div>
    </div>
  )
}
