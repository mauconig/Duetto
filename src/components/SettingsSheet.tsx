import { useEffect, useState } from 'react'
import { useApi, type Pareja } from '../lib/api'
import { useT } from '../lib/i18n/contexto'
import { traducirError } from '../lib/i18n/erroresServidor'

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
  const t = useT()
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
      setError(err instanceof Error ? traducirError(err.message, t) : t('ajustes_error'))
      setGuardando(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{t('ajustes_titulo')}</h3>
          <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="sheet__form" onSubmit={handleSubmit}>
          <label className="sheet__field">
            <span>{t('perfil_tu_nombre')}</span>
            <input type="text" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} required />
          </label>

          <label className="sheet__field">
            <span>{t('perfil_fecha_aniversario')}</span>
            <input type="date" value={fecha} max={hoyIso()} onChange={(e) => setFecha(e.target.value)} required />
            <span className="sheet__hint">{t('ajustes_fecha_hint')}</span>
          </label>

          <div className="sheet__field">
            <span>{t('ajustes_proximo_hito')}</span>
            <div className="onboarding__opciones">
              <button
                type="button"
                className={`onboarding__opcion${hito === 'aniversario' ? ' onboarding__opcion--activa' : ''}`}
                onClick={() => setHito('aniversario')}
              >
                <span className="onboarding__opcion-titulo">{t('hito_opcion_aniversario_titulo')}</span>
                <span className="onboarding__opcion-desc">{t('hito_opcion_aniversario_desc')}</span>
              </button>
              <button
                type="button"
                className={`onboarding__opcion${hito === 'cumplemes' ? ' onboarding__opcion--activa' : ''}`}
                onClick={() => setHito('cumplemes')}
              >
                <span className="onboarding__opcion-titulo">{t('hito_opcion_cumplemes_titulo')}</span>
                <span className="onboarding__opcion-desc">{t('hito_opcion_cumplemes_desc')}</span>
              </button>
            </div>
          </div>

          {error && <div className="onboarding__error">{error}</div>}

          <button type="submit" className="sheet__submit" disabled={!valido || guardando}>
            {guardando ? t('comun_guardando') : t('comun_guardar_cambios')}
          </button>
        </form>
      </div>
    </div>
  )
}
