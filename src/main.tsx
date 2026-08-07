import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { enUS, esUY, ptBR } from '@clerk/localizations'
import './index.css'
import App from './App.tsx'
import { clerkAppearanceClaro, clerkAppearanceOscuro } from './lib/clerkTheme.ts'
import { iniciarTema, useTema } from './lib/tema.ts'
import { registrarServiceWorker } from './lib/compartir.ts'
import { IdiomaProvider, useIdiomaContexto } from './lib/i18n/contexto.tsx'
import type { IdiomaResuelto } from './lib/i18n/index.ts'

// Before the first paint, so a dark-mode user never sees a white flash.
iniciarTema()

// Needed for Android's share sheet to hand photos to the app.
registrarServiceWorker()

/* esUY is Rioplatense Spanish (voseo) — closest match to how the rest of the
   app is written; there is no esAR locale. ptBR over ptPT for the same
   reason the dictionary picked Brazilian Portuguese: it's the variant with
   the wider reach. */
const CLERK_LOCALIZACIONES: Record<IdiomaResuelto, typeof esUY> = { es: esUY, en: enUS, pt: ptBR }

function Root() {
  const { esOscuro } = useTema()
  // Below IdiomaProvider, so it can read the language the couple picked —
  // Clerk's own screens (sign-in, sign-up) follow it the same as everything
  // else, instead of being the one part of the app stuck in Spanish.
  const { resuelto } = useIdiomaContexto()
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      appearance={esOscuro ? clerkAppearanceOscuro : clerkAppearanceClaro}
      localization={CLERK_LOCALIZACIONES[resuelto]}
    >
      <App />
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IdiomaProvider>
      <Root />
    </IdiomaProvider>
  </StrictMode>,
)
