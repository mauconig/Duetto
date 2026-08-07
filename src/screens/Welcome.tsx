import { SignInButton, SignUpButton } from '@clerk/react'

export function Welcome() {
  return (
    <div className="screen welcome">
      <div className="welcome__hero">
        {/* Same drawing as the app icon, but outlined instead of sitting on a
            crimson tile — on the welcome screen the background already carries
            the colour, and the white cards read on both themes. */}
        {/* Cropped to the artwork instead of the icon's square: the pair is
            wider than it is tall, so a 100×100 box left it floating small
            between two bands of empty space. */}
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
        <h1 className="welcome__title">Pictogether</h1>
        <p className="welcome__subtitle">Su espacio para guardar recuerdos, ideas y momentos juntos.</p>
      </div>

      <SignInButton mode="modal">
        <button type="button" className="cta-button welcome__signin">
          Iniciar sesión
        </button>
      </SignInButton>

      <SignUpButton mode="modal">
        <button type="button" className="welcome__signup">
          Crear una cuenta
        </button>
      </SignUpButton>
    </div>
  )
}
