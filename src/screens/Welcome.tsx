import { SignInButton, SignUpButton } from '@clerk/react'

export function Welcome() {
  return (
    <div className="screen welcome">
      <div className="welcome__hero">
        <div className="welcome__heart">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="#fff" stroke="none">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </div>
        <h1 className="welcome__title">Duette</h1>
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
