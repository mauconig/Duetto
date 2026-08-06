import type { ClerkAppearanceTheme } from '@clerk/shared/types'

/** Clerk renders its modals in its own DOM subtree with its own styles, so
 * it can't read the app's CSS variables — the palette has to be handed to
 * it explicitly, and swapped when the theme changes. */
interface Paleta {
  superficie: string
  superficieInput: string
  texto: string
  textoTenue: string
  suave: string
  acento: string
  acentoFuerte: string
  acentoClaro: string
  borde: string
  anillo: string
  sombra: string
  backdrop: string
  sombraTarjeta: string
}

const CLARO: Paleta = {
  superficie: '#fff8f6',
  superficieInput: '#ffffff',
  texto: '#33191c',
  textoTenue: '#a5737a',
  suave: '#f8e3e4',
  acento: '#b03246',
  acentoFuerte: '#a32f42',
  acentoClaro: '#c9455a',
  borde: 'rgba(176, 50, 70, 0.18)',
  anillo: 'rgba(176, 50, 70, 0.35)',
  sombra: 'rgba(176, 50, 70, 0.18)',
  backdrop: 'rgba(20, 8, 10, 0.55)',
  sombraTarjeta: '0 14px 34px rgba(176, 50, 70, 0.22)',
}

const OSCURO: Paleta = {
  superficie: '#232022',
  superficieInput: '#2b2729',
  texto: '#f0eaea',
  textoTenue: '#a89ea0',
  suave: '#353032',
  acento: '#e0687d',
  acentoFuerte: '#eb8093',
  acentoClaro: '#d4566d',
  borde: 'rgba(224, 104, 125, 0.24)',
  anillo: 'rgba(224, 104, 125, 0.4)',
  sombra: 'rgba(0, 0, 0, 0.5)',
  backdrop: 'rgba(6, 5, 6, 0.72)',
  sombraTarjeta: '0 14px 34px rgba(0, 0, 0, 0.5)',
}

function construir(p: Paleta): ClerkAppearanceTheme {
  return {
    variables: {
      colorPrimary: p.acento,
      colorPrimaryForeground: '#ffffff',
      colorForeground: p.texto,
      colorMutedForeground: p.textoTenue,
      colorMuted: p.suave,
      colorBackground: p.superficie,
      colorInput: p.superficieInput,
      colorInputForeground: p.texto,
      colorBorder: p.borde,
      colorRing: p.anillo,
      colorShadow: p.sombra,
      colorDanger: p.acentoClaro,
      colorModalBackdrop: p.backdrop,
      fontFamily: "'Nunito', system-ui, sans-serif",
      fontFamilyButtons: "'Quicksand', sans-serif",
      borderRadius: '14px',
    },
    elements: {
      cardBox: {
        borderRadius: '28px',
        overflow: 'hidden',
        boxShadow: p.sombraTarjeta,
      },
      // Explicitly square + shadowless: cardBox already rounds and shades
      // the whole modal, so any radius left on the inner card curves away
      // from the straight footer below it and shows as notches at the seam.
      card: {
        borderRadius: '0',
        boxShadow: 'none',
        border: 'none',
        background: p.superficie,
        paddingBottom: '28px',
      },
      headerTitle: {
        fontFamily: "'Quicksand', sans-serif",
        fontWeight: 700,
        fontSize: '24px',
      },
      headerSubtitle: {
        color: p.textoTenue,
        fontWeight: 600,
      },
      formButtonPrimary: {
        background: `linear-gradient(135deg, ${p.acentoClaro}, ${p.acento})`,
        borderRadius: '24px',
        fontFamily: "'Quicksand', sans-serif",
        fontWeight: 700,
        fontSize: '15px',
        textTransform: 'none',
        boxShadow: `0 10px 24px ${p.sombra}`,
      },
      socialButtonsBlockButton: {
        background: p.superficieInput,
        borderColor: p.borde,
        fontWeight: 700,
      },
      // Same surface as the card, no divider or radius of its own — the
      // modal reads as one continuous panel, not a card plus a strip.
      footer: {
        background: p.superficie,
        borderTop: 'none',
        borderRadius: '0',
        boxShadow: 'none',
        paddingTop: '0',
      },
      footerAction: {
        background: 'transparent',
        borderTop: 'none',
      },
      footerActionText: {
        color: p.textoTenue,
        fontWeight: 600,
      },
      footerActionLink: {
        color: p.acentoFuerte,
        fontWeight: 700,
      },
    },
  }
}

export const clerkAppearanceClaro = construir(CLARO)
export const clerkAppearanceOscuro = construir(OSCURO)
