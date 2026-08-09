import { SignInButton, SignUpButton } from '@clerk/react'
import { useIdiomaContexto } from '../lib/i18n/contexto'
import { OPCIONES_IDIOMA } from '../lib/idioma'
import type { ClaveTexto } from '../lib/i18n'

/** The three things the app does, said once each. Icons are the same ones the
 * nav uses for those tabs, so what you're promised here is recognisable once
 * you're inside. */
const PUNTOS: { clave: ClaveTexto; icono: React.ReactNode }[] = [
  {
    clave: 'bienvenida_punto_album',
    icono: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </>
    ),
  },
  {
    clave: 'bienvenida_punto_ruleta',
    icono: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v7.5" />
        <path d="m20.5 17-6.5-3.75" />
        <path d="m3.5 17 6.5-3.75" />
      </>
    ),
  },
  {
    clave: 'bienvenida_punto_tiempo',
    icono: (
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    ),
  },
]

export function Welcome() {
  const { setIdioma, resuelto, t } = useIdiomaContexto()

  return (
    <div className="screen welcome">
      <div className="tema-selector welcome__idioma">
        {OPCIONES_IDIOMA.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={`tema-selector__opcion tema-selector__opcion--bandera${resuelto === o.valor ? ' tema-selector__opcion--activa' : ''}`}
            aria-label={t(o.clave)}
            title={t(o.clave)}
            onClick={() => setIdioma(o.valor)}
          >
            {o.bandera}
          </button>
        ))}
      </div>

      <div className="welcome__hero">
        {/* Same drawing as the app icon, but outlined instead of sitting on a
            crimson tile — the background already carries the colour here, and
            the white cards read on both themes. Cropped to the artwork: the
            pair is wider than it is tall, so the icon's square box left it
            floating small between two bands of empty space. */}
        <svg className="welcome__marca" viewBox="14 20 73 50" role="img" aria-label="Pictogether">
          <defs>
            <path
              id="marca-corazon"
              d="M12 20.4S4 14.8 4 9.4A4.8 4.8 0 0 1 8.8 4.6c1.5 0 2.7.8 3.2 1.8.5-1 1.7-1.8 3.2-1.8A4.8 4.8 0 0 1 20 9.4c0 5.4-8 11-8 11Z"
            />
          </defs>
          <g transform="translate(36 44) rotate(-7)">
            <rect x="-18" y="-19" width="36" height="38" rx="4.5" fill="#fff" stroke="#a32f42" strokeWidth="3.2" />
            <rect x="-13" y="-13.5" width="26" height="22" rx="2" fill="#eeb0b8" />
          </g>
          <g transform="translate(64 44) rotate(7)">
            <rect x="-18" y="-19" width="36" height="38" rx="4.5" fill="#fff" stroke="#a32f42" strokeWidth="3.2" />
            <rect x="-13" y="-13.5" width="26" height="22" rx="2" fill="#d4707f" />
          </g>
          <g transform="translate(50 58) scale(0.95) translate(-12 -12.5)">
            <use href="#marca-corazon" fill="#fff" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
            <use href="#marca-corazon" fill="#a32f42" />
          </g>
        </svg>
        <h1 className="welcome__title">pictogether</h1>
        <p className="welcome__subtitle">{t('bienvenida_subtitulo')}</p>
      </div>

      <ul className="welcome__puntos">
        {PUNTOS.map(({ clave, icono }) => (
          <li className="welcome__punto" key={clave}>
            <span className="welcome__punto-icono" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {icono}
              </svg>
            </span>
            <span className="welcome__punto-texto">{t(clave)}</span>
          </li>
        ))}
      </ul>

      <div className="welcome__acciones">
        {/* Signing up is the primary action on a page only signed-out people
            see; logging in used to be the filled button, which put the loud
            treatment on the smaller audience. */}
        <SignUpButton mode="modal">
          <button type="button" className="cta-button cta-button--acento welcome__boton">
            {t('bienvenida_crear_cuenta')}
          </button>
        </SignUpButton>

        <SignInButton mode="modal">
          <button type="button" className="welcome__boton welcome__boton--contorno">
            {t('bienvenida_iniciar_sesion')}
          </button>
        </SignInButton>
      </div>

      <p className="welcome__legal">
        {t('bienvenida_legal_previo')}{' '}
        <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">
          {t('bienvenida_legal_privacidad')}
        </a>
        .
      </p>
    </div>
  )
}
