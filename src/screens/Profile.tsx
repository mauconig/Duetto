import { useEffect, useRef, useState } from 'react'
import { SignOutButton, useUser } from '@clerk/react'
import { Avatar } from '../components/Avatar'
import { RecortarFoto } from '../components/RecortarFoto'
import { useTema, type Tema } from '../lib/tema'
import { useIdiomaContexto } from '../lib/i18n/contexto'
import { OPCIONES_IDIOMA } from '../lib/idioma'
import type { ClaveTexto, FuncionT } from '../lib/i18n/index'
import type { PerfilDatos, PerfilMiembro } from '../lib/api'

const OPCIONES_TEMA: { valor: Tema; clave: ClaveTexto }[] = [
  { valor: 'auto', clave: 'comun_tema_auto' },
  { valor: 'claro', clave: 'comun_tema_claro' },
  { valor: 'oscuro', clave: 'comun_tema_oscuro' },
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
  premium: boolean
  espacioUsado: number
  espacioLimite: number
  perfilPropio: PerfilMiembro | null
  perfilPareja: PerfilMiembro | null
  perfilesCargando: boolean
  errorPerfiles: string | null
  onReintentarPerfiles: () => void
  onEditarPerfil: () => void
  onAbrirAjustes: () => void
  onDesvincular: () => void
}

/** `1.2 GB`-style label. Storage sizes here never exceed low single-digit GB,
 * so two units cover every couple this app has. */
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function PortadaCancion({ url, titulo, t }: { url: string | null; titulo: string; t: FuncionT }) {
  const [fallida, setFallida] = useState(false)
  useEffect(() => setFallida(false), [url])
  if (!url || fallida) return <div className="partner-profile-song-cover partner-profile-song-cover--placeholder">♫</div>
  return <img className="partner-profile-song-cover" src={url} alt={t('perfil_portada_alt', titulo)} onError={() => setFallida(true)} />
}

function DatosPerfilVista({ datos, t }: { datos: PerfilDatos; t: FuncionT }) {
  const filas: { etiqueta: string; valor: string | null }[] = [
    { etiqueta: t('perfil_color_favorito'), valor: datos.colorFavorito },
    { etiqueta: t('perfil_comida_favorita'), valor: datos.comidaFavorita },
    { etiqueta: t('perfil_bebida_favorita'), valor: datos.bebidaFavorita },
    { etiqueta: t('perfil_hobbies'), valor: datos.hobbies },
    { etiqueta: t('perfil_gustos'), valor: datos.gustos },
    { etiqueta: t('perfil_disgustos'), valor: datos.disgustos },
    { etiqueta: t('perfil_ideas_regalo'), valor: datos.ideasRegalo },
    { etiqueta: t('perfil_talle_arriba'), valor: datos.talles.arriba },
    { etiqueta: t('perfil_talle_abajo'), valor: datos.talles.abajo },
    { etiqueta: t('perfil_talle_zapatos'), valor: datos.talles.zapatos },
    { etiqueta: t('perfil_talle_abrigo'), valor: datos.talles.abrigo },
    { etiqueta: t('perfil_talle_prenda'), valor: datos.talles.prenda },
    { etiqueta: t('perfil_talle_otro'), valor: datos.talles.otro },
  ]
  const tieneCancion = Boolean(datos.cancion.url || datos.cancion.titulo || datos.cancion.artista || datos.cancion.album)
  const tieneAlgo = tieneCancion || filas.some((fila) => fila.valor) || datos.personalizados.length > 0

  if (!tieneAlgo) return <p className="partner-profile-empty">{t('perfil_sin_datos')}</p>

  return (
    <div className="partner-profile-data">
      {tieneCancion && (
        <div className="partner-profile-song">
          <PortadaCancion url={datos.cancion.portadaUrl} titulo={datos.cancion.titulo || t('perfil_cancion_favorita')} t={t} />
          <div className="partner-profile-song__info">
            {datos.cancion.titulo && <strong>{datos.cancion.titulo}</strong>}
            {datos.cancion.artista && <span>{datos.cancion.artista}</span>}
            {datos.cancion.album && <small>{datos.cancion.album}</small>}
            {datos.cancion.url && (
              <a href={datos.cancion.url} target="_blank" rel="noopener noreferrer">
                {datos.cancion.proveedor === 'spotify'
                  ? t('perfil_cancion_proveedor_spotify')
                  : datos.cancion.proveedor === 'apple'
                    ? t('perfil_cancion_proveedor_apple')
                    : t('perfil_cancion_proveedor_youtube')}
              </a>
            )}
          </div>
        </div>
      )}
      <div className="partner-profile-data-grid">
        {filas.filter((fila) => fila.valor).map((fila) => (
          <div className="partner-profile-data-row" key={fila.etiqueta}>
            <span>{fila.etiqueta}</span>
            <strong>{fila.valor}</strong>
          </div>
        ))}
      </div>
      {datos.personalizados.length > 0 && (
        <div className="partner-profile-custom-data">
          {datos.personalizados.map((dato) => (
            <div className="partner-profile-data-row" key={dato.id}>
              <span>{dato.etiqueta}</span>
              <strong>{dato.valor}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DatosPareja({
  propio,
  pareja,
  vinculada,
  cargando,
  error,
  onReintentar,
  onEditar,
  t,
}: {
  propio: PerfilMiembro | null
  pareja: PerfilMiembro | null
  vinculada: boolean
  cargando: boolean
  error: string | null
  onReintentar: () => void
  onEditar: () => void
  t: FuncionT
}) {
  return (
    <section className="partner-profile-section">
      <div className="partner-profile-section__heading">
        <h3>{t('perfil_datos_pareja')}</h3>
        <button type="button" className="partner-profile-edit" onClick={onEditar}>{t('perfil_editar_datos')}</button>
      </div>
      {cargando && <p className="partner-profile-status">{t('perfil_cargando_datos')}</p>}
      {error && (
        <div className="partner-profile-status partner-profile-status--error">
          <span>{error}</span>
          <button type="button" onClick={onReintentar}>{t('perfil_reintentar_datos')}</button>
        </div>
      )}
      {!cargando && !error && (
        <div className="partner-profile-cards">
          {propio && (
            <article className="partner-profile-card partner-profile-card--mine">
              <div className="partner-profile-card__header"><h4>{t('perfil_mis_datos')}</h4><span>✦</span></div>
              <DatosPerfilVista datos={propio.datos} t={t} />
            </article>
          )}
          <article className="partner-profile-card">
            <div className="partner-profile-card__header"><h4>{pareja ? t('perfil_datos_de', pareja.nombre) : t('perfil_datos_de', t('salir_pareja_generica'))}</h4><span>♡</span></div>
            {pareja ? <DatosPerfilVista datos={pareja.datos} t={t} /> : <p className="partner-profile-empty">{vinculada ? t('perfil_sin_datos') : t('perfil_pareja_esperando')}</p>}
          </article>
        </div>
      )}
    </section>
  )
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
  premium,
  espacioUsado,
  espacioLimite,
  perfilPropio,
  perfilPareja,
  perfilesCargando,
  errorPerfiles,
  onReintentarPerfiles,
  onEditarPerfil,
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
  const { setIdioma, resuelto, t } = useIdiomaContexto()

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
    } catch {
      setErrorImagen(t('perfil_error_cambiar_foto'))
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
    } catch {
      setErrorImagen(t('perfil_error_quitar_foto'))
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
      <h2>{t('nav_perfil')}</h2>

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
            aria-label={imagenPropia ? t('perfil_cambiar_foto') : t('perfil_poner_foto')}
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
            {t('perfil_quitar_foto')}
          </button>
        )}
        {errorImagen && <div className="onboarding__error">{errorImagen}</div>}
        <div className="profile-card__name">
          {nombres}
          {premium && <span className="badge-premium">{t('perfil_premium')}</span>}
        </div>
        <div className="profile-card__since">{t('inicio_juntos_desde', fechaInicioTexto)}</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__num">{diasJuntos}</div>
          <div className="stat-card__label">{t('perfil_dias_juntos')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__num">{numAlbumes}</div>
          <div className="stat-card__label">{t('perfil_stat_recuerdos')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__num">{numIdeas}</div>
          <div className="stat-card__label">{t('perfil_stat_ideas')}</div>
        </div>
      </div>

      <DatosPareja
        propio={perfilPropio}
        pareja={perfilPareja}
        vinculada={vinculada}
        cargando={perfilesCargando}
        error={errorPerfiles}
        onReintentar={onReintentarPerfiles}
        onEditar={onEditarPerfil}
        t={t}
      />

      <div className="settings-panel">
        <div className="settings-row" role="button" onClick={onAbrirAjustes}>
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span className="settings-row__label">{t('perfil_tu_nombre')}</span>
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
          <span className="settings-row__label">{t('perfil_fecha_aniversario')}</span>
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
          <span className="settings-row__label">{vinculada ? t('perfil_pareja_vinculada') : t('perfil_invitar_pareja')}</span>
          {vinculada ? (
            <span className="settings-row__value">✓</span>
          ) : (
            <button type="button" className="settings-row__codigo" onClick={copiarCodigo}>
              {copiado ? t('comun_copiado') : codigo}
            </button>
          )}
        </div>
        <div className="settings-row settings-row--espacio">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
              <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
            </svg>
          </div>
          <div className="settings-row__espacio-contenido">
            <div className="settings-row__espacio-top">
              <span className="settings-row__label">{t('perfil_espacio')}</span>
              <span className="settings-row__value">
                {t('perfil_espacio_valor', formatBytes(espacioUsado), formatBytes(espacioLimite))}
              </span>
            </div>
            <div
              className="espacio-barra"
              role="progressbar"
              aria-valuenow={Math.min(100, Math.round((espacioUsado / espacioLimite) * 100))}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="espacio-barra__relleno"
                style={{ width: `${Math.min(100, (espacioUsado / espacioLimite) * 100)}%` }}
              />
            </div>
          </div>
        </div>
        <div className="settings-row settings-row--tema">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </div>
          <span className="settings-row__label">{t('perfil_apariencia')}</span>
          <div className="tema-selector">
            {OPCIONES_TEMA.map((o) => (
              <button
                key={o.valor}
                type="button"
                className={`tema-selector__opcion${tema === o.valor ? ' tema-selector__opcion--activa' : ''}`}
                onClick={() => setTema(o.valor)}
              >
                {t(o.clave)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row settings-row--tema">
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8h14" />
              <path d="M9 5v3.5A9.5 9.5 0 0 1 3.5 17" />
              <path d="M6 12c1.6 2.3 4.2 4 7 4.5" />
              <path d="m13 20 4-9 4 9" />
              <path d="M14.5 17h5" />
            </svg>
          </div>
          <span className="settings-row__label">{t('perfil_idioma')}</span>
          <div className="tema-selector">
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
        </div>
        <div className="settings-row settings-row--danger" role="button" onClick={onDesvincular}>
          <div className="settings-row__icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--acento-fuerte)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
          </div>
          <span className="settings-row__label settings-row__label--bold">{t('perfil_desvincularme')}</span>
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
            <span className="settings-row__label settings-row__label--bold">{t('perfil_cerrar_sesion')}</span>
          </div>
        </SignOutButton>
      </div>

      <p className="legal-nota">
        <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">
          {t('comun_politica_privacidad')}
        </a>
      </p>

      {recortando && (
        <RecortarFoto archivo={recortando} onListo={guardarRecorte} onCancelar={() => setRecortando(null)} />
      )}
    </div>
  )
}
