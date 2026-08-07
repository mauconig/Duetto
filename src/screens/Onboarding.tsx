import { useEffect, useRef, useState } from 'react'
import { useApi, type Pareja } from '../lib/api'
import { useT } from '../lib/i18n/contexto'
import { traducirError } from '../lib/i18n/erroresServidor'

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
  const t = useT()
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
      setError(e instanceof Error ? traducirError(e.message, t) : t('comun_algo_salio_mal'))
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
      setError(t('onboarding_no_se_pudo_copiar'))
    }
  }

  return (
    <div className="screen onboarding">
      <div className="onboarding__top">
        {puedeVolver ? (
          <button type="button" className="back-btn" aria-label={t('comun_volver')} onClick={() => setPaso(ruta[indice - 1])}>
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
            <h2>{t('onboarding_nombre_titulo')}</h2>
            <p className="page-subtitle">{t('onboarding_nombre_subtitulo')}</p>
            <input
              ref={inputRef}
              className="onboarding__input"
              type="text"
              value={nombre}
              placeholder={t('onboarding_nombre_placeholder')}
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
                {t('onboarding_consentimiento_pre')}{' '}
                <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">
                  {t('comun_politica_privacidad')}
                </a>
                {t('onboarding_consentimiento_post')}
              </span>
            </label>
          </div>
        )}

        {paso === 'vincular' && (
          <div className="onboarding__paso">
            <h2>{t('onboarding_vincular_titulo')}</h2>
            <p className="page-subtitle">{t('onboarding_vincular_subtitulo')}</p>
            <div className="onboarding__opciones">
              <button type="button" className="onboarding__opcion" disabled={ocupado} onClick={elegirCrear}>
                <span className="onboarding__opcion-titulo">{t('onboarding_crear_codigo_titulo')}</span>
                <span className="onboarding__opcion-desc">{t('onboarding_crear_codigo_desc')}</span>
              </button>
              <button type="button" className="onboarding__opcion" disabled={ocupado} onClick={elegirUnirse}>
                <span className="onboarding__opcion-titulo">{t('onboarding_tengo_codigo_titulo')}</span>
                <span className="onboarding__opcion-desc">{t('onboarding_tengo_codigo_desc')}</span>
              </button>
            </div>
          </div>
        )}

        {paso === 'codigo' && pareja && (
          <div className="onboarding__paso">
            <h2>{t('onboarding_codigo_titulo')}</h2>
            <p className="page-subtitle">{t('onboarding_codigo_subtitulo')}</p>
            <div className="codigo-box">
              <div className="codigo-box__valor">{pareja.codigo}</div>
              <button type="button" className="codigo-box__copiar" onClick={copiarCodigo}>
                {copiado ? t('comun_copiado') : t('comun_copiar')}
              </button>
            </div>
          </div>
        )}

        {paso === 'ingresar' && (
          <div className="onboarding__paso">
            <h2>{t('onboarding_ingresar_titulo')}</h2>
            <p className="page-subtitle">{t('onboarding_ingresar_subtitulo')}</p>
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
            <h2>{t('onboarding_fecha_titulo')}</h2>
            <p className="page-subtitle">{t('onboarding_fecha_subtitulo')}</p>
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
            <h2>{t('onboarding_hito_titulo')}</h2>
            <p className="page-subtitle">{t('onboarding_hito_subtitulo')}</p>
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
        )}

        {error && <div className="onboarding__error">{error}</div>}

        {paso !== 'vincular' && (
          <button type="submit" className="sheet__submit" disabled={!valido || ocupado}>
            {ocupado ? t('comun_un_momento') : paso === 'hito' ? t('onboarding_empezar') : t('comun_continuar')}
          </button>
        )}
      </form>
    </div>
  )
}
