import { useEffect, useRef, useState } from 'react'
import { useApi, type MetadataMusica, type PerfilDatos, type PerfilMiembro, type PerfilesPareja, type ProveedorMusica } from '../lib/api'
import { useT } from '../lib/i18n/contexto'

interface PartnerProfileSheetProps {
  perfil: PerfilMiembro | null
  onClose: () => void
  onGuardar: (perfiles: PerfilesPareja) => void
}

function datosVacios(): PerfilDatos {
  return {
    colorFavorito: null,
    cancion: { titulo: null, artista: null, album: null, proveedor: null, url: null, portadaUrl: null },
    comidaFavorita: null,
    bebidaFavorita: null,
    hobbies: null,
    gustos: null,
    disgustos: null,
    ideasRegalo: null,
    talles: { arriba: null, abajo: null, zapatos: null, abrigo: null, prenda: null, otro: null },
    personalizados: [],
  }
}

function datosIniciales(perfil: PerfilMiembro | null): PerfilDatos {
  if (!perfil) return datosVacios()
  return {
    ...perfil.datos,
    cancion: { ...perfil.datos.cancion },
    talles: { ...perfil.datos.talles },
    personalizados: perfil.datos.personalizados.map((dato) => ({ ...dato })),
  }
}

const proveedorLabel: Record<ProveedorMusica, 'perfil_cancion_proveedor_spotify' | 'perfil_cancion_proveedor_youtube' | 'perfil_cancion_proveedor_apple'> = {
  spotify: 'perfil_cancion_proveedor_spotify',
  youtube: 'perfil_cancion_proveedor_youtube',
  apple: 'perfil_cancion_proveedor_apple',
}

function idTemporal(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `nuevo-${Date.now()}-${Math.random()}`
}

function PortadaPreview({ url }: { url: string | null }) {
  const [fallida, setFallida] = useState(false)
  useEffect(() => setFallida(false), [url])
  if (!url || fallida) return <div className="partner-profile-song-preview__placeholder">♫</div>
  return <img src={url} alt="" onError={() => setFallida(true)} />
}

export function PartnerProfileSheet({ perfil, onClose, onGuardar }: PartnerProfileSheetProps) {
  const api = useApi()
  const t = useT()
  const [form, setForm] = useState<PerfilDatos>(() => datosIniciales(perfil))
  const [resolviendo, setResolviendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMusica, setErrorMusica] = useState<string | null>(null)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const urlResolviendo = useRef<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  async function resolverMusica() {
    const url = form.cancion.url?.trim() ?? ''
    if (!url || resolviendo || urlResolviendo.current === url) return
    urlResolviendo.current = url
    setResolviendo(true)
    setErrorMusica(null)
    try {
      const metadata = await api.obtenerMetadataMusica(url)
      aplicarMetadata(metadata, url)
    } catch {
      setErrorMusica(t('perfil_error_metadata_musica'))
    } finally {
      if (urlResolviendo.current === url) urlResolviendo.current = null
      setResolviendo(false)
    }
  }

  function aplicarMetadata(metadata: MetadataMusica, urlSolicitada: string) {
    setForm((prev) => {
      if (prev.cancion.url?.trim() !== urlSolicitada) return prev
      return {
        ...prev,
        cancion: {
          ...prev.cancion,
          proveedor: metadata.proveedor,
          titulo: metadata.titulo ?? prev.cancion.titulo,
          artista: metadata.artista ?? prev.cancion.artista,
          album: metadata.album ?? prev.cancion.album,
          portadaUrl: metadata.portadaUrl ?? prev.cancion.portadaUrl,
          // The resolver keeps the pasted URL, including shortened links.
          url: metadata.url,
        },
      }
    })
  }

  function actualizarCampo(campo: keyof Omit<PerfilDatos, 'cancion' | 'talles' | 'personalizados'>, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor || null }))
  }

  function actualizarTalle(campo: keyof PerfilDatos['talles'], valor: string) {
    setForm((prev) => ({ ...prev, talles: { ...prev.talles, [campo]: valor || null } }))
  }

  function actualizarCancion(campo: 'titulo' | 'artista' | 'album' | 'portadaUrl', valor: string) {
    setForm((prev) => ({ ...prev, cancion: { ...prev.cancion, [campo]: valor || null } }))
  }

  function actualizarEnlace(url: string) {
    setErrorMusica(null)
    setForm((prev) => ({
      ...prev,
      cancion: {
        ...prev.cancion,
        url: url || null,
        proveedor: null,
        titulo: null,
        artista: null,
        album: null,
        portadaUrl: null,
      },
    }))
  }

  function agregarDato() {
    if (form.personalizados.length >= 10) return
    setForm((prev) => ({
      ...prev,
      personalizados: [...prev.personalizados, { id: idTemporal(), etiqueta: '', valor: '', posicion: prev.personalizados.length }],
    }))
  }

  function actualizarDato(id: string, campo: 'etiqueta' | 'valor', valor: string) {
    setForm((prev) => ({
      ...prev,
      personalizados: prev.personalizados.map((dato) => (dato.id === id ? { ...dato, [campo]: valor } : dato)),
    }))
  }

  function quitarDato(id: string) {
    setForm((prev) => ({
      ...prev,
      personalizados: prev.personalizados.filter((dato) => dato.id !== id).map((dato, posicion) => ({ ...dato, posicion })),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (guardando) return
    setGuardando(true)
    setErrorGuardado(null)
    try {
      const perfiles = await api.guardarPerfilPareja({
        ...form,
        personalizados: form.personalizados.map((dato, posicion) => ({ ...dato, posicion })),
      })
      onGuardar(perfiles)
    } catch {
      setErrorGuardado(t('perfil_error_guardar_datos'))
      setGuardando(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet--perfil" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{t('perfil_editar_datos')}</h3>
          <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={onClose}>
            ×
          </button>
        </div>

        <form className="sheet__form partner-profile-form" onSubmit={handleSubmit}>
          <div className="partner-profile-form__section">
            <h4>{t('perfil_favoritos')}</h4>
            <label className="sheet__field">
              <span>{t('perfil_color_favorito')}</span>
              <input type="text" maxLength={120} value={form.colorFavorito ?? ''} onChange={(e) => actualizarCampo('colorFavorito', e.target.value)} />
            </label>
            <label className="sheet__field">
              <span>{t('perfil_comida_favorita')}</span>
              <input type="text" maxLength={120} value={form.comidaFavorita ?? ''} onChange={(e) => actualizarCampo('comidaFavorita', e.target.value)} />
            </label>
            <label className="sheet__field">
              <span>{t('perfil_bebida_favorita')}</span>
              <input type="text" maxLength={120} value={form.bebidaFavorita ?? ''} onChange={(e) => actualizarCampo('bebidaFavorita', e.target.value)} />
            </label>
          </div>

          <div className="partner-profile-form__section">
            <h4>{t('perfil_cancion_favorita')}</h4>
            <label className="sheet__field">
              <span>{t('perfil_cancion_enlace')}</span>
              <div className="partner-profile-song-link">
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://..."
                  value={form.cancion.url ?? ''}
                  onChange={(e) => actualizarEnlace(e.target.value)}
                  onBlur={() => void resolverMusica()}
                />
                <button type="button" className="partner-profile-inline-button" onClick={() => void resolverMusica()} disabled={!form.cancion.url || resolviendo}>
                  {resolviendo ? t('perfil_cancion_buscando') : t('perfil_cancion_buscar')}
                </button>
              </div>
            </label>
            {form.cancion.proveedor && <span className="partner-profile-provider">{t(proveedorLabel[form.cancion.proveedor])}</span>}
            {errorMusica && <div className="onboarding__error">{errorMusica}</div>}
            {form.cancion.url && (form.cancion.titulo || form.cancion.artista || form.cancion.portadaUrl) && (
              <div className="partner-profile-song-preview">
                <PortadaPreview url={form.cancion.portadaUrl} />
                <div>
                  <strong>{form.cancion.titulo || t('perfil_cancion_titulo')}</strong>
                  <span>{form.cancion.artista || t('perfil_cancion_artista')}</span>
                </div>
              </div>
            )}
            <label className="sheet__field">
              <span>{t('perfil_cancion_titulo')}</span>
              <input type="text" maxLength={120} value={form.cancion.titulo ?? ''} onChange={(e) => actualizarCancion('titulo', e.target.value)} />
            </label>
            <label className="sheet__field">
              <span>{t('perfil_cancion_artista')}</span>
              <input type="text" maxLength={120} value={form.cancion.artista ?? ''} onChange={(e) => actualizarCancion('artista', e.target.value)} />
            </label>
            <label className="sheet__field">
              <span>{t('perfil_cancion_album')}</span>
              <input type="text" maxLength={120} value={form.cancion.album ?? ''} onChange={(e) => actualizarCancion('album', e.target.value)} />
            </label>
            <label className="sheet__field">
              <span>{t('perfil_cancion_portada_url')}</span>
              <input type="url" inputMode="url" value={form.cancion.portadaUrl ?? ''} onChange={(e) => actualizarCancion('portadaUrl', e.target.value)} />
            </label>
          </div>

          <div className="partner-profile-form__section">
            <h4>{t('perfil_gustos')}</h4>
            <label className="sheet__field"><span>{t('perfil_hobbies')}</span><textarea maxLength={500} rows={3} value={form.hobbies ?? ''} onChange={(e) => actualizarCampo('hobbies', e.target.value)} /></label>
            <label className="sheet__field"><span>{t('perfil_gustos')}</span><textarea maxLength={500} rows={3} value={form.gustos ?? ''} onChange={(e) => actualizarCampo('gustos', e.target.value)} /></label>
            <label className="sheet__field"><span>{t('perfil_disgustos')}</span><textarea maxLength={500} rows={3} value={form.disgustos ?? ''} onChange={(e) => actualizarCampo('disgustos', e.target.value)} /></label>
            <label className="sheet__field"><span>{t('perfil_ideas_regalo')}</span><textarea maxLength={500} rows={3} value={form.ideasRegalo ?? ''} onChange={(e) => actualizarCampo('ideasRegalo', e.target.value)} /></label>
          </div>

          <div className="partner-profile-form__section">
            <h4>{t('perfil_talles')}</h4>
            <div className="partner-profile-size-grid">
              <label className="sheet__field"><span>{t('perfil_talle_arriba')}</span><input type="text" maxLength={120} value={form.talles.arriba ?? ''} onChange={(e) => actualizarTalle('arriba', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_talle_abajo')}</span><input type="text" maxLength={120} value={form.talles.abajo ?? ''} onChange={(e) => actualizarTalle('abajo', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_talle_zapatos')}</span><input type="text" maxLength={120} value={form.talles.zapatos ?? ''} onChange={(e) => actualizarTalle('zapatos', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_talle_abrigo')}</span><input type="text" maxLength={120} value={form.talles.abrigo ?? ''} onChange={(e) => actualizarTalle('abrigo', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_talle_prenda')}</span><input type="text" maxLength={120} value={form.talles.prenda ?? ''} onChange={(e) => actualizarTalle('prenda', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_talle_otro')}</span><input type="text" maxLength={120} value={form.talles.otro ?? ''} onChange={(e) => actualizarTalle('otro', e.target.value)} /></label>
            </div>
          </div>

          <div className="partner-profile-form__section">
            <div className="partner-profile-form__section-heading">
              <h4>{t('perfil_personalizados')}</h4>
              <button type="button" className="partner-profile-inline-button" onClick={agregarDato} disabled={form.personalizados.length >= 10}>
                + {t('perfil_agregar_dato')}
              </button>
            </div>
            {form.personalizados.map((dato) => (
              <div className="partner-profile-fact-row" key={dato.id}>
                <input type="text" maxLength={40} aria-label={t('perfil_etiqueta')} placeholder={t('perfil_etiqueta')} value={dato.etiqueta} onChange={(e) => actualizarDato(dato.id, 'etiqueta', e.target.value)} />
                <input type="text" maxLength={300} aria-label={t('perfil_valor')} placeholder={t('perfil_valor')} value={dato.valor} onChange={(e) => actualizarDato(dato.id, 'valor', e.target.value)} />
                <button type="button" className="partner-profile-fact-remove" aria-label={t('perfil_quitar_dato')} onClick={() => quitarDato(dato.id)}>×</button>
              </div>
            ))}
          </div>

          {errorGuardado && <div className="onboarding__error">{errorGuardado}</div>}
          <button type="submit" className="sheet__submit" disabled={guardando}>
            {guardando ? t('comun_guardando') : t('perfil_guardar_datos')}
          </button>
          <button type="button" className="partner-profile-cancel" onClick={onClose}>{t('perfil_cancelar')}</button>
        </form>
      </div>
    </div>
  )
}
