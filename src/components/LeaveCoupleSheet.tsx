import { useEffect, useState } from 'react'
import { useApi, type Pareja } from '../lib/api'
import { useT } from '../lib/i18n/contexto'
import { traducirError } from '../lib/i18n/erroresServidor'

interface LeaveCoupleSheetProps {
  pareja: Pareja
  onClose: () => void
  onSalio: () => void
}

/** The way out of joining with the wrong code. What it costs depends on
 * whether the other partner is already in: with them there the memories
 * stay theirs, alone there's nobody left to keep them — so the warning
 * says which of the two is about to happen. */
export function LeaveCoupleSheet({ pareja, onClose, onSalio }: LeaveCoupleSheetProps) {
  const api = useApi()
  const t = useT()
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const partner = pareja.nombrePareja ?? t('salir_pareja_generica')

  async function salir() {
    if (saliendo) return
    setSaliendo(true)
    setError(null)
    try {
      await api.salirDePareja()
      onSalio()
    } catch (err) {
      setError(err instanceof Error ? traducirError(err.message, t) : t('salir_error'))
      setSaliendo(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{t('salir_titulo')}</h3>
          <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet__form">
          {pareja.vinculada ? (
            <p className="sheet__confirmar-texto">{t('salir_texto_vinculada', partner)}</p>
          ) : (
            <p className="sheet__confirmar-texto">{t('salir_texto_sola')}</p>
          )}

          {error && <div className="onboarding__error">{error}</div>}

          <div className="sheet__confirmar-acciones">
            <button type="button" className="sheet__cancelar" onClick={onClose}>
              {t('comun_cancelar')}
            </button>
            <button type="button" className="sheet__borrar-confirmar" disabled={saliendo} onClick={salir}>
              {saliendo ? t('salir_saliendo') : t('salir_confirmar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
