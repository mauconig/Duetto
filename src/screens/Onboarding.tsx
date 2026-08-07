import { useEffect, useRef, useState } from 'react'
import { useApi, type Pareja } from '../lib/api'

type Paso = 'nombre' | 'vincular' | 'codigo' | 'ingresar' | 'fecha' | 'hito'

/** The screens each path walks through, so the progress bar is honest:
 * whoever joins with a code skips the date/milestone questions because
 * the couple already answered them. */
const RUTA_CREAR: Paso[] = ['nombre', 'vincular', 'codigo', 'fecha', 'hito']
const RUTA_UNIRSE: Paso[] = ['nombre', 'vincular', 'ingresar']

function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface OnboardingProps {
  parejaInicial: Pareja | null
  onListo: (pareja: Pareja) => void
}

export function Onboarding({ parejaInicial, onListo }: OnboardingProps) {
  const api = useApi()
  const [pareja, setPareja] = useState<Pareja | null>(parejaInicial)
  const [paso, setPaso] = useState<Paso>(parejaInicial ? 'fecha' : 'nombre')
  const [ruta, setRuta] = useState<Paso[]>(RUTA_CREAR)
  const [nombre, setNombre] = useState(parejaInicial?.nombrePropio ?? '')
  const [codigoIngresado, setCodigoIngresado] = useState('')
  const [fecha, setFecha] = useState(parejaInicial?.fechaAniversario ?? '')
  const [hito, setHito] = useState<'cumplemes' | 'aniversario'>(parejaInicial?.proximoHito ?? 'aniversario')
  // Anyone already in a couple accepted this on their way in, so returning
  // to finish the profile must not ask again.
  const [acepto, setAcepto] = useState(parejaInicial !== null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    setError(null)
  }, [paso])

  const indice = ruta.indexOf(paso)
  const puedeVolver = indice > 0 && paso !== 'codigo'

  const valido =
    paso === 'nombre'
      ? nombre.trim() !== '' && acepto
      : paso === 'ingresar'
        ? codigoIngresado.trim().length >= 4
        : paso === 'fecha'
          ? fecha !== ''
          : true

  async function correr(fn: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal')
    } finally {
      setOcupado(false)
    }
  }

  function elegirCrear() {
    setRuta(RUTA_CREAR)
    correr(async () => {
      const p = await api.crearPareja(nombre.trim())
      setPareja(p)
      setPaso('codigo')
    })
  }

  function elegirUnirse() {
    setRuta(RUTA_UNIRSE)
    setPaso('ingresar')
  }

  function confirmarCodigo() {
    correr(async () => {
      const p = await api.unirsePareja(nombre.trim(), codigoIngresado)
      setPareja(p)
      // The couple that created the code already answered these, so the
      // second partner goes straight in.
      if (p.fechaAniversario && p.proximoHito) onListo(p)
      else {
        setRuta(RUTA_UNIRSE.concat('fecha', 'hito'))
        setPaso('fecha')
      }
    })
  }

  function guardarPerfil() {
    correr(async () => {
      const p = await api.guardarPerfil({ fechaAniversario: fecha, proximoHito: hito })
      onListo(p)
    })
  }

  function siguiente(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || ocupado) return
    if (paso === 'nombre') setPaso('vincular')
    else if (paso === 'codigo') setPaso('fecha')
    else if (paso === 'ingresar') confirmarCodigo()
    else if (paso === 'fecha') setPaso('hito')
    else if (paso === 'hito') guardarPerfil()
  }

  async function copiarCodigo() {
    if (!pareja) return
    try {
      await navigator.clipboard.writeText(pareja.codigo)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      setError('No se pudo copiar. Anotalo a mano.')
    }
  }

  return (
    <div className="screen onboarding">
      <div className="onboarding__top">
        {puedeVolver ? (
          <button type="button" className="back-btn" aria-label="Volver" onClick={() => setPaso(ruta[indice - 1])}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        ) : (
          <div className="back-btn back-btn--placeholder" />
        )}
        <div className="onboarding__dots">
          {ruta.map((p, i) => (
            <div key={p} className={`onboarding__dot${i === indice ? ' onboarding__dot--active' : ''}${i < indice ? ' onboarding__dot--done' : ''}`} />
          ))}
        </div>
      </div>

      <form className="onboarding__form" onSubmit={siguiente}>
        {paso === 'nombre' && (
          <div className="onboarding__paso">
            <h2>¿Cómo te llamás?</h2>
            <p className="page-subtitle">Así sabemos cómo saludarte cada día.</p>
            <input
              ref={inputRef}
              className="onboarding__input"
              type="text"
              value={nombre}
              placeholder="Tu nombre"
              autoComplete="given-name"
              maxLength={40}
              onChange={(e) => setNombre(e.target.value)}
            />
            <label className="consentimiento">
              <input
                type="checkbox"
                checked={acepto}
                onChange={(e) => setAcepto(e.target.checked)}
              />
              <span>
                Leí y acepto la{' '}
                <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">
                  Política de Privacidad
                </a>
                , incluido que mis fotos se guardan en un servidor en Estados Unidos.
              </span>
            </label>
          </div>
        )}

        {paso === 'vincular' && (
          <div className="onboarding__paso">
            <h2>Conectá con tu pareja</h2>
            <p className="page-subtitle">Pictogether se comparte de a dos: uno crea un código y el otro lo usa para entrar.</p>
            <div className="onboarding__opciones">
              <button type="button" className="onboarding__opcion" disabled={ocupado} onClick={elegirCrear}>
                <span className="onboarding__opcion-titulo">Crear un código</span>
                <span className="onboarding__opcion-desc">Generá uno y compartíselo a tu pareja.</span>
              </button>
              <button type="button" className="onboarding__opcion" disabled={ocupado} onClick={elegirUnirse}>
                <span className="onboarding__opcion-titulo">Ya tengo un código</span>
                <span className="onboarding__opcion-desc">Tu pareja ya creó el suyo y te lo pasó.</span>
              </button>
            </div>
          </div>
        )}

        {paso === 'codigo' && pareja && (
          <div className="onboarding__paso">
            <h2>Este es su código</h2>
            <p className="page-subtitle">Pasáselo a tu pareja para que lo ingrese. Podés seguir usando la app mientras tanto.</p>
            <div className="codigo-box">
              <div className="codigo-box__valor">{pareja.codigo}</div>
              <button type="button" className="codigo-box__copiar" onClick={copiarCodigo}>
                {copiado ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        {paso === 'ingresar' && (
          <div className="onboarding__paso">
            <h2>Ingresá el código</h2>
            <p className="page-subtitle">El que te pasó tu pareja.</p>
            <input
              ref={inputRef}
              className="onboarding__input onboarding__input--codigo"
              type="text"
              value={codigoIngresado}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={12}
              onChange={(e) => setCodigoIngresado(e.target.value.toUpperCase())}
            />
          </div>
        )}

        {paso === 'fecha' && (
          <div className="onboarding__paso">
            <h2>¿Cuándo empezaron?</h2>
            <p className="page-subtitle">Desde esta fecha contamos el tiempo juntos.</p>
            <input
              ref={inputRef}
              className="onboarding__input"
              type="date"
              value={fecha}
              max={hoyIso()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        )}

        {paso === 'hito' && (
          <div className="onboarding__paso">
            <h2>¿Qué querés ver primero?</h2>
            <p className="page-subtitle">El hito que Pictogether les va a mostrar en la pantalla de inicio.</p>
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
        )}

        {error && <div className="onboarding__error">{error}</div>}

        {paso !== 'vincular' && (
          <button type="submit" className="sheet__submit" disabled={!valido || ocupado}>
            {ocupado ? 'Un momento...' : paso === 'hito' ? 'Empezar' : 'Continuar'}
          </button>
        )}
      </form>
    </div>
  )
}
