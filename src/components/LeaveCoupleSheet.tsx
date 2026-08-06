import { useEffect, useState } from 'react'
import { useApi, type Pareja } from '../lib/api'

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
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const partner = pareja.nombrePareja ?? 'tu pareja'

  async function salir() {
    if (saliendo) return
    setSaliendo(true)
    setError(null)
    try {
      await api.salirDePareja()
      onSalio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos desvincularte')
      setSaliendo(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>Desvincularte</h3>
          <button type="button" className="sheet__close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet__form">
          {pareja.vinculada ? (
            <p className="sheet__confirmar-texto">
              Vas a salir de la pareja con {partner}. Dejás de ver los recuerdos, las fotos y las ideas compartidas —
              {' '}
              {partner} los conserva. Si querés volver, te alcanza con entrar de nuevo con el mismo código.
            </p>
          ) : (
            <p className="sheet__confirmar-texto">
              Todavía no se unió nadie a tu código, así que no queda nadie para guardar lo que subiste: se borran todos
              tus recuerdos, sus fotos y las ideas de la ruleta. No se puede deshacer.
            </p>
          )}

          {error && <div className="onboarding__error">{error}</div>}

          <div className="sheet__confirmar-acciones">
            <button type="button" className="sheet__cancelar" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="sheet__borrar-confirmar" disabled={saliendo} onClick={salir}>
              {saliendo ? 'Saliendo...' : 'Sí, desvincularme'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
