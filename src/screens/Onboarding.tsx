import { useState } from 'react'
import { useUser } from '@clerk/react'
import type { PerfilPareja } from '../lib/perfilPareja'

export function Onboarding() {
  const { user } = useUser()
  const [nombrePropio, setNombrePropio] = useState('')
  const [nombrePareja, setNombrePareja] = useState('')
  const [fechaAniversario, setFechaAniversario] = useState('')
  const [proximoHito, setProximoHito] = useState<PerfilPareja['proximoHito']>('aniversario')
  const [guardando, setGuardando] = useState(false)

  const listo = nombrePropio.trim() !== '' && nombrePareja.trim() !== '' && fechaAniversario !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!listo || guardando || !user) return
    setGuardando(true)
    await user.update({
      unsafeMetadata: {
        nombrePropio: nombrePropio.trim(),
        nombrePareja: nombrePareja.trim(),
        fechaAniversario,
        proximoHito,
      } satisfies PerfilPareja,
    })
  }

  return (
    <div className="screen">
      <h2>Antes de empezar</h2>
      <p className="page-subtitle">Contanos un poco de ustedes para armar Duette a su medida.</p>

      <form className="onboarding-form" onSubmit={handleSubmit}>
        <label className="sheet__field">
          <span>Tu nombre</span>
          <input type="text" value={nombrePropio} onChange={(e) => setNombrePropio(e.target.value)} required />
        </label>

        <label className="sheet__field">
          <span>Nombre de tu pareja</span>
          <input type="text" value={nombrePareja} onChange={(e) => setNombrePareja(e.target.value)} required />
        </label>

        <label className="sheet__field">
          <span>Fecha de aniversario</span>
          <input type="date" value={fechaAniversario} onChange={(e) => setFechaAniversario(e.target.value)} required />
        </label>

        <div className="sheet__field">
          <span>¿Qué querés trackear como próximo hito?</span>
          <div className="onboarding-radios">
            <label className="onboarding-radio">
              <input
                type="radio"
                name="proximoHito"
                checked={proximoHito === 'aniversario'}
                onChange={() => setProximoHito('aniversario')}
              />
              <span>Próximo aniversario</span>
            </label>
            <label className="onboarding-radio">
              <input
                type="radio"
                name="proximoHito"
                checked={proximoHito === 'cumplemes'}
                onChange={() => setProximoHito('cumplemes')}
              />
              <span>Próximo cumplemés</span>
            </label>
          </div>
        </div>

        <button type="submit" className="sheet__submit" disabled={!listo || guardando}>
          {guardando ? 'Guardando...' : 'Empezar'}
        </button>
      </form>
    </div>
  )
}
