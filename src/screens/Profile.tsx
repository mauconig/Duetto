import { useRef, useState } from 'react'
import { SignOutButton, useUser } from '@clerk/react'
import { Avatar } from '../components/Avatar'
import { RecortarFoto } from '../components/RecortarFoto'
import { useTema, type Tema } from '../lib/tema'

const OPCIONES_TEMA: { valor: Tema; etiqueta: string }[] = [
  { valor: 'auto', etiqueta: 'Auto' },
  { valor: 'claro', etiqueta: 'Claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro' },
]

interface ProfileProps {
  nombres: string
  nombrePropio: string
  inicial1: string
  inicial2: string
  /** Null when there's no photo, which is when the initial shows. */
  imagenPropia: string | null
  imagenPareja: string | null
  fechaInicioTexto: string
  diasJuntos: number
  numAlbumes: number
  numIdeas: number
  codigo: string
  vinculada: boolean
  onAbrirAjustes: () => void
  onDesvincular: () => void
}

export function Profile({
  nombres,
  nombrePropio,
  inicial1,
  inicial2,
  imagenPropia,
  imagenPareja,
  fechaInicioTexto,
  diasJuntos,
  numAlbumes,
  numIdeas,
  codigo,
  vinculada,
  onAbrirAjustes,
  onDesvincular,
}: ProfileProps) {
  const [copiado, setCopiado] = useState(false)
  const [cambiandoImagen, setCambiandoImagen] = useState(false)
  const [errorImagen, setErrorImagen] = useState<string | null>(null)
  /** The picked file, while its owner decides what part of it to keep. */
  const [recortando, setRecortando] = useState<File | null>(null)
  const imagenInputRef = useRef<HTMLInputElement>(null)
  const { user } = useUser()
  const { tema, setTema } = useTema()

  /** Clerk stores the photo and hands back a URL; App picks the change up
   * through useUser and tells the server, so the partner sees it too.
   *
   * The blob arrives already square and already the right size, cropped
   * where its owner chose — there is nothing left to downscale. */
  async function guardarRecorte(recorte: Blob) {
    setRecortando(null)
    setCambiandoImagen(true)
    setErrorImagen(null)
    try {
      await user?.setProfileImage({ file: new File([recorte], 'perfil.webp', { type: 'image/webp' }) })
    } catch (e) {
      setErrorImagen(e instanceof Error ? e.message : 'No pudimos cambiar la foto')
    } finally {
      setCambiandoImagen(false)
    }
  }

  async function quitarImagen() {
    if (cambiandoImagen) return
    setCambiandoImagen(true)
    setErrorImagen(null)
    try {
      // Null is how Clerk is told to drop it; the initial comes back.
      await user?.setProfileImage({ file: null })
    } catch (e) {
      setErrorImagen(e instanceof Error ? e.message : 'No pudimos quitar la foto')
    } finally {
      setCambiandoImagen(false)
    }
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Clipboard can be blocked; the code is on screen to copy by hand.
    }
  }

  return (
    <div className="screen">
      <h2>Perfil</h2>

      <div className="profile-card">
        <div className="profile-card__avatars">
          {/* Only ours is editable, and it says so: a camera badge on one
              face and nothing on the other. Changing your partner's photo
              is not a thing anybody should be offered. */}
          <button
            type="button"
            className="profile-card__avatar-editable"
            onClick={() => imagenInputRef.current?.click()}
            disabled={cambiandoImagen}
            aria-label={imagenPropia ? 'Cambiar tu foto' : 'Poner tu foto'}
          >
            <Avatar url={imagenPropia} inicial={inicial1} className="profile-card__avatar profile-card__avatar--a" />
            <span className="profile-card__avatar-camara" aria-hidden="true">
              {cambiandoImagen ? (
                '…'
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L8 6H4v14h16V6h-4l-1.5-2Z" />
                  <circle cx="12" cy="13" r="3.2" />
                </svg>
              )}
            </span>
          </button>
          <Avatar url={imagenPareja} inicial={inicial2} className="profile-card__avatar profile-card__avatar--b" />
          <input
            ref={imagenInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const archivo = e.target.files?.[0]
              // Cleared straight away so picking the same file twice still
              // fires a change.
              e.target.value = ''
              if (archivo) setRecortando(archivo)
            }}
          />
        </div>
        {imagenPropia && (
          <button type="button" className="profile-card__quitar-foto" onClick={quitarImagen} disabled={cambiandoImagen}>
            Quitar mi foto
          </button>
        )}
        {errorImagen && <div className="onboarding__error">{errorImagen}</div>}
        <div className="profile-card__name">{nombres}</div>
        <div className="profile-card__since">Juntos desde el {fechaInicioTexto}</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__num">{diasJuntos}</div>
          <div className="stat-card__label">días juntos</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__num">{numAlbumes}</div>
          <div className="stat-card__label">recuerdos</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__num">{numIdeas}</div>
          <div className="stat-card__label">ideas de cita</div>
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-row" role="button" onClick={onAbrirAjustes}>
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span className="settings-row__label">Tu nombre</span>
          <span className="settings-row__value">{nombrePropio}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--icono-tenue)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
        <div className="settings-row" role="button" onClick={onAbrirAjustes}>
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="4" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </svg>
          </div>
          <span className="settings-row__label">Fecha de aniversario</span>
          <span className="settings-row__value">{fechaInicioTexto}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--icono-tenue)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
        <div className="settings-row">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <span className="settings-row__label">{vinculada ? 'Pareja vinculada' : 'Invitar a tu pareja'}</span>
          {vinculada ? (
            <span className="settings-row__value">✓</span>
          ) : (
            <button type="button" className="settings-row__codigo" onClick={copiarCodigo}>
              {copiado ? '¡Copiado!' : codigo}
            </button>
          )}
        </div>
        <div className="settings-row settings-row--tema">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </div>
          <span className="settings-row__label">Apariencia</span>
          <div className="tema-selector">
            {OPCIONES_TEMA.map((o) => (
              <button
                key={o.valor}
                type="button"
                className={`tema-selector__opcion${tema === o.valor ? ' tema-selector__opcion--activa' : ''}`}
                onClick={() => setTema(o.valor)}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row settings-row--danger" role="button" onClick={onDesvincular}>
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          </div>
          <span className="settings-row__label settings-row__label--bold">Desvincularme de la pareja</span>
        </div>
        <SignOutButton>
          <div className="settings-row settings-row--danger" role="button">
            <div className="settings-row__icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <span className="settings-row__label settings-row__label--bold">Cerrar sesión</span>
          </div>
        </SignOutButton>
      </div>

      <p className="legal-nota">
        <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">
          Política de Privacidad
        </a>
      </p>

      {recortando && (
        <RecortarFoto archivo={recortando} onListo={guardarRecorte} onCancelar={() => setRecortando(null)} />
      )}
    </div>
  )
}
