import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { esUY } from '@clerk/localizations'
import './index.css'
import App from './App.tsx'
import { clerkAppearanceClaro, clerkAppearanceOscuro } from './lib/clerkTheme.ts'
import { iniciarTema, useTema } from './lib/tema.ts'

// Before the first paint, so a dark-mode user never sees a white flash.
iniciarTema()

function Root() {
  const { esOscuro } = useTema()
  return (
    /* esUY is Rioplatense Spanish (voseo) — closest match to how the
       rest of the app is written; there is no esAR locale. */
    <ClerkProvider
      afterSignOutUrl="/"
      appearance={esOscuro ? clerkAppearanceOscuro : clerkAppearanceClaro}
      localization={esUY}
    >
      <App />
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
