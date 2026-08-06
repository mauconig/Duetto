import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { esUY } from '@clerk/localizations'
import './index.css'
import App from './App.tsx'
import { clerkAppearance } from './lib/clerkTheme.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* esUY is Rioplatense Spanish (voseo) — closest match to how the
        rest of the app is written; there is no esAR locale. */}
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance} localization={esUY}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
