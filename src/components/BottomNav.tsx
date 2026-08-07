import type { Tab } from '../types'
import { useT } from '../lib/i18n/contexto'
import type { ClaveTexto } from '../lib/i18n/index'

const ITEMS: { tab: Tab; clave: ClaveTexto; icon: React.ReactNode }[] = [
  {
    tab: 'inicio',
    clave: 'nav_inicio',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    tab: 'albumes',
    clave: 'nav_recuerdos',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
  },
  {
    tab: 'ruleta',
    clave: 'nav_ruleta',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v7.5" />
        <path d="m19 17-4.9-2.8" />
        <path d="m5 17 4.9-2.8" />
      </svg>
    ),
  },
  {
    tab: 'inspiracion',
    // Not "Ideas": the roulette is already full of ideas de cita.
    clave: 'nav_inspiracion',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z" />
      </svg>
    ),
  },
  {
    tab: 'perfil',
    clave: 'nav_perfil',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
]

interface BottomNavProps {
  active: Tab
  onChange: (tab: Tab) => void
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const t = useT()
  return (
    <div className="bottom-nav">
      {ITEMS.map(({ tab, clave, icon }) => (
        <button
          key={tab}
          type="button"
          className={`nav-btn${tab === active ? ' nav-btn--active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {icon}
          <span>{t(clave)}</span>
        </button>
      ))}
    </div>
  )
}
