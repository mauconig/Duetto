import { useEffect, useState } from 'react'
import { useApi, type Pareja } from '../lib/api'

interface SettingsSheetProps {
  pareja: Pareja
  onClose: () => void
  onGuardar: (pareja: Pareja) => void
}

function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lets a partner fix what they set during onboarding. The name only ever
 * changes their own — the date and milestone belong to the couple, so
 * changing either updates it for both. */
export function SettingsSheet({ pareja, onClose, onGuardar }: SettingsSheetProps) {
  const api = useApi()
  const [nombre, setNombre] = useState(pareja.nombrePropio ?? '')
  const [fecha, setFecha] = useState(pareja.fechaAniversario ?? '')
  const [hito, setHito] = useState<'cumplemes' | 'aniversario'>(pareja.proximoHito ?? 'aniversario')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const valido = nombre.trim() !== '' && fecha !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || guardando) return
    setGuardando(true)
    setError(null)
    try {
      const actualizada = await api.guardarPerfil({
        nombre: nombre.trim(),
        fechaAniversario: fecha,
        proximoHito: hito,
      })
      onGuardar(actualizada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar los cambios')
      setGuardando(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>Ajustes</h3>
          <button type="button" className="sheet__close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="sheet__form" onSubmit={handleSubmit}>
          <label className="sheet__field">
            <span>Tu nombre</span>
            <input type="text" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} required />
          </label>

          <label className="sheet__field">
            <span>Fecha de aniversario</span>
            <input type="date" value={fecha} max={hoyIso()} onChange={(e) => setFecha(e.target.value)} required />
            <span className="sheet__hint">Cambia para los dos.</span>
          </label>

          <div className="sheet__field">
            <span>Próximo hito</span>
            <div className="onboarding__opciones">
              <button
                type="button"
                className={`onboarding__opcion${hito === 'aniversario' ? ' onboarding__opcion--activa' : ''}`}
                onClick={() => setHito('aniversario')}
              >
                <span className="onboarding__opcion-titulo">Próximo aniversario</span>
                <span className="onboarding__opcion-desc">Una vez al año, la fecha en que empezaron.</span>
              </button>
              <button
                type="button"
                className={`onboarding__opcion${hito === 'cumplemes' ? ' onboarding__opcion--activa' : ''}`}
                onClick={() => setHito('cumplemes')}
              >
                <span className="onboarding__opcion-titulo">Próximo cumplemés</span>
                <span className="onboarding__opcion-desc">Todos los meses, el mismo día del mes.</span>
              </button>
            </div>
          </div>

          {error && <div className="onboarding__error">{error}</div>}

          <button type="submit" className="sheet__submit" disabled={!valido || guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}
