import type { ClerkAppearanceTheme } from '@clerk/shared/types'

/** Makes Clerk's sign-in/sign-up modals look like the rest of Duette:
 * same warm palette, Quicksand/Nunito type, rounded cards and the
 * gradient primary button used across the app. */
export const clerkAppearance: ClerkAppearanceTheme = {
  variables: {
    colorPrimary: '#b03246',
    colorPrimaryForeground: '#ffffff',
    colorForeground: '#33191c',
    colorMutedForeground: '#a5737a',
    colorMuted: '#f8e3e4',
    colorBackground: '#fff8f6',
    colorInput: '#ffffff',
    colorInputForeground: '#33191c',
    colorBorder: 'rgba(176, 50, 70, 0.18)',
    colorRing: 'rgba(176, 50, 70, 0.35)',
    colorShadow: 'rgba(176, 50, 70, 0.18)',
    colorDanger: '#c9455a',
    colorModalBackdrop: 'rgba(20, 8, 10, 0.55)',
    fontFamily: "'Nunito', system-ui, sans-serif",
    fontFamilyButtons: "'Quicksand', sans-serif",
    borderRadius: '14px',
  },
  elements: {
    cardBox: {
      borderRadius: '28px',
      overflow: 'hidden',
      boxShadow: '0 14px 34px rgba(176, 50, 70, 0.22)',
    },
    // Explicitly square + shadowless: cardBox already rounds and shades
    // the whole modal, so any radius left on the inner card curves away
    // from the straight footer below it and shows as notches at the seam.
    card: {
      borderRadius: '0',
      boxShadow: 'none',
      border: 'none',
      background: '#fff8f6',
      paddingBottom: '28px',
    },
    headerTitle: {
      fontFamily: "'Quicksand', sans-serif",
      fontWeight: 700,
      fontSize: '24px',
    },
    headerSubtitle: {
      color: '#a5737a',
      fontWeight: 600,
    },
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #c9455a, #b03246)',
      borderRadius: '24px',
      fontFamily: "'Quicksand', sans-serif",
      fontWeight: 700,
      fontSize: '15px',
      textTransform: 'none',
      boxShadow: '0 10px 24px rgba(176, 50, 70, 0.3)',
    },
    socialButtonsBlockButton: {
      background: '#ffffff',
      borderColor: 'rgba(176, 50, 70, 0.18)',
      fontWeight: 700,
    },
    // Same surface as the card, no divider or radius of its own — the
    // modal reads as one continuous panel, not a card plus a strip.
    footer: {
      background: '#fff8f6',
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
      color: '#a5737a',
      fontWeight: 600,
    },
    footerActionLink: {
      color: '#a32f42',
      fontWeight: 700,
    },
  },
}
