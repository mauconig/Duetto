import { useEffect, useRef, useState } from 'react'
import { useApi, type MetadataMusica, type PerfilDatos, type PerfilMiembro, type PerfilesPareja, type ProveedorMusica } from '../lib/api'
import { useT } from '../lib/i18n/contexto'

interface PartnerProfileSheetProps {
  perfil: PerfilMiembro | null
  onClose: () => void
  onGuardar: (perfiles: PerfilesPareja) => void
}

type SeccionEditor = 'favoritos' | 'cancion' | 'gustos' | 'talles' | 'otros'

function datosVacios(): PerfilDatos {
  return {
    colorFavorito: { hex: null, nombre: null },
    proveedorMusicaPreferido: null,
    cancion: { titulo: null, artista: null, album: null, proveedor: null, url: null, portadaUrl: null },
    comidaFavorita: null,
    bebidaFavorita: null,
    hobbies: null,
    gustos: null,
    disgustos: null,
    ideasRegalo: null,
    talles: { arriba: null, abajo: null, zapatos: null, otro: null },
    personalizados: [],
  }
}

function datosIniciales(perfil: PerfilMiembro | null): PerfilDatos {
  if (!perfil) return datosVacios()
  const color = typeof perfil.datos.colorFavorito === 'string'
    ? { hex: null, nombre: perfil.datos.colorFavorito }
    : { ...perfil.datos.colorFavorito }
  return {
    ...perfil.datos,
    colorFavorito: color,
    proveedorMusicaPreferido: perfil.datos.proveedorMusicaPreferido ?? null,
    cancion: { ...perfil.datos.cancion },
    talles: { arriba: perfil.datos.talles.arriba, abajo: perfil.datos.talles.abajo, zapatos: perfil.datos.talles.zapatos, otro: perfil.datos.talles.otro },
    personalizados: perfil.datos.personalizados.map((dato) => ({ ...dato })),
  }
}

const proveedores: { id: ProveedorMusica; clave: 'perfil_cancion_proveedor_spotify' | 'perfil_cancion_proveedor_youtube' | 'perfil_cancion_proveedor_apple' }[] = [
  { id: 'spotify', clave: 'perfil_cancion_proveedor_spotify' },
  { id: 'youtube', clave: 'perfil_cancion_proveedor_youtube' },
  { id: 'apple', clave: 'perfil_cancion_proveedor_apple' },
]

const colores = ['#F97373', '#F59E0B', '#FACC15', '#4ADE80', '#22D3EE', '#60A5FA', '#A78BFA', '#F472B6', '#A8A29E']

function idTemporal(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `nuevo-${Date.now()}-${Math.random()}`
}

function PortadaPreview({ url }: { url: string | null }) {
  const [fallida, setFallida] = useState(false)
  useEffect(() => setFallida(false), [url])
  if (!url || fallida) return <div className="partner-profile-song-preview__placeholder">♫</div>
  return <img src={url} alt="" onError={() => setFallida(true)} />
}

function Acordeon({ titulo, abierto, onClick, children }: { titulo: string; abierto: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <section className={`partner-profile-editor-section${abierto ? ' partner-profile-editor-section--open' : ''}`}>
      <button type="button" className="partner-profile-editor-section__trigger" aria-expanded={abierto} onClick={onClick}>
        <span>{titulo}</span><span aria-hidden="true">{abierto ? '−' : '+'}</span>
      </button>
      {abierto && <div className="partner-profile-editor-section__content">{children}</div>}
    </section>
  )
}

export function PartnerProfileSheet({ perfil, onClose, onGuardar }: PartnerProfileSheetProps) {
  const api = useApi()
  const t = useT()
  const [form, setForm] = useState<PerfilDatos>(() => datosIniciales(perfil))
  const [abierta, setAbierta] = useState<SeccionEditor>('favoritos')
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

  function abrir(seccion: SeccionEditor) {
    setAbierta((actual) => actual === seccion ? actual : seccion)
  }

  function actualizarCampo(campo: 'comidaFavorita' | 'bebidaFavorita' | 'hobbies' | 'gustos' | 'disgustos' | 'ideasRegalo', valor: string) {
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
      cancion: { ...prev.cancion, url: url || null, proveedor: null, titulo: null, artista: null, album: null, portadaUrl: null },
    }))
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
          url: metadata.url,
        },
      }
    })
  }

  async function resolverMusica() {
    const url = form.cancion.url?.trim() ?? ''
    if (!url || resolviendo || urlResolviendo.current === url) return
    urlResolviendo.current = url
    setResolviendo(true)
    setErrorMusica(null)
    try {
      aplicarMetadata(await api.obtenerMetadataMusica(url), url)
    } catch {
      setErrorMusica(t('perfil_error_metadata_musica'))
    } finally {
      if (urlResolviendo.current === url) urlResolviendo.current = null
      setResolviendo(false)
    }
  }

  function actualizarDato(id: string, campo: 'etiqueta' | 'valor', valor: string) {
    setForm((prev) => ({ ...prev, personalizados: prev.personalizados.map((dato) => dato.id === id ? { ...dato, [campo]: valor } : dato) }))
  }

  function agregarDato() {
    if (form.personalizados.length >= 10) return
    setForm((prev) => ({ ...prev, personalizados: [...prev.personalizados, { id: idTemporal(), etiqueta: '', valor: '', posicion: prev.personalizados.length }] }))
  }

  function quitarDato(id: string) {
    setForm((prev) => ({ ...prev, personalizados: prev.personalizados.filter((dato) => dato.id !== id).map((dato, posicion) => ({ ...dato, posicion })) }))
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
      <div className="sheet sheet--perfil-editor" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <h3>{t('perfil_editar_datos')}</h3>
          <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={onClose}>×</button>
        </div>

        <form className="partner-profile-editor" onSubmit={handleSubmit}>
          <div className="partner-profile-editor__scroll">
            <Acordeon titulo={t('perfil_favoritos')} abierto={abierta === 'favoritos'} onClick={() => abrir('favoritos')}>
              <div className="partner-profile-color-picker"><span className="partner-profile-form-label">{t('perfil_color_paleta')}</span><div className="partner-profile-color-swatches">{colores.map((color) => <button key={color} type="button" className={`partner-profile-color-swatch${form.colorFavorito.hex === color ? ' partner-profile-color-swatch--active' : ''}`} style={{ backgroundColor: color }} aria-label={color} onClick={() => setForm((prev) => ({ ...prev, colorFavorito: { ...prev.colorFavorito, hex: color } }))} />)}<label className="partner-profile-color-custom" title={t('perfil_color_personalizado')}><input type="color" value={form.colorFavorito.hex ?? '#F97373'} onChange={(e) => setForm((prev) => ({ ...prev, colorFavorito: { ...prev.colorFavorito, hex: e.target.value.toUpperCase() } }))} /><span>+</span></label></div></div>
              <label className="sheet__field"><span>{t('perfil_color_nombre')}</span><input type="text" maxLength={120} value={form.colorFavorito.nombre ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, colorFavorito: { ...prev.colorFavorito, nombre: e.target.value || null } }))} /></label>
              <label className="sheet__field"><span>{t('perfil_comida_favorita')}</span><input type="text" maxLength={120} value={form.comidaFavorita ?? ''} onChange={(e) => actualizarCampo('comidaFavorita', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_bebida_favorita')}</span><input type="text" maxLength={120} value={form.bebidaFavorita ?? ''} onChange={(e) => actualizarCampo('bebidaFavorita', e.target.value)} /></label>
            </Acordeon>

            <Acordeon titulo={t('perfil_cancion_favorita')} abierto={abierta === 'cancion'} onClick={() => abrir('cancion')}>
              <label className="sheet__field"><span>{t('perfil_cancion_enlace')}</span><div className="partner-profile-song-link"><input type="url" inputMode="url" placeholder="https://..." value={form.cancion.url ?? ''} onChange={(e) => actualizarEnlace(e.target.value)} onBlur={() => void resolverMusica()} /><button type="button" className="partner-profile-inline-button" onClick={() => void resolverMusica()} disabled={!form.cancion.url || resolviendo}>{resolviendo ? t('perfil_cancion_buscando') : t('perfil_cancion_buscar')}</button></div></label>
              {form.cancion.proveedor && <span className="partner-profile-provider">{t(form.cancion.proveedor === 'spotify' ? 'perfil_cancion_proveedor_spotify' : form.cancion.proveedor === 'apple' ? 'perfil_cancion_proveedor_apple' : 'perfil_cancion_proveedor_youtube')}</span>}
              {errorMusica && <div className="onboarding__error">{errorMusica}</div>}
              {form.cancion.url && (form.cancion.titulo || form.cancion.artista || form.cancion.portadaUrl) && <div className="partner-profile-song-preview"><PortadaPreview url={form.cancion.portadaUrl} /><div><strong>{form.cancion.titulo || t('perfil_cancion_titulo')}</strong><span>{form.cancion.artista || t('perfil_cancion_artista')}</span></div></div>}
              <label className="sheet__field"><span>{t('perfil_cancion_titulo')}</span><input type="text" maxLength={120} value={form.cancion.titulo ?? ''} onChange={(e) => actualizarCancion('titulo', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_cancion_artista')}</span><input type="text" maxLength={120} value={form.cancion.artista ?? ''} onChange={(e) => actualizarCancion('artista', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_cancion_album')}</span><input type="text" maxLength={120} value={form.cancion.album ?? ''} onChange={(e) => actualizarCancion('album', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_cancion_portada_url')}</span><input type="url" inputMode="url" value={form.cancion.portadaUrl ?? ''} onChange={(e) => actualizarCancion('portadaUrl', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_servicio_preferido')}</span><select value={form.proveedorMusicaPreferido ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, proveedorMusicaPreferido: (e.target.value || null) as ProveedorMusica | null }))}><option value="">{t('perfil_sin_preferencia')}</option>{proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{t(proveedor.clave)}</option>)}</select></label>
            </Acordeon>

            <Acordeon titulo={t('perfil_gustos_disgustos')} abierto={abierta === 'gustos'} onClick={() => abrir('gustos')}>
              <label className="sheet__field"><span>{t('perfil_hobbies')}</span><textarea maxLength={500} rows={3} value={form.hobbies ?? ''} onChange={(e) => actualizarCampo('hobbies', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_gustos')}</span><textarea maxLength={500} rows={3} value={form.gustos ?? ''} onChange={(e) => actualizarCampo('gustos', e.target.value)} /></label>
              <label className="sheet__field"><span>{t('perfil_disgustos')}</span><textarea maxLength={500} rows={3} value={form.disgustos ?? ''} onChange={(e) => actualizarCampo('disgustos', e.target.value)} /></label>
            </Acordeon>

            <Acordeon titulo={t('perfil_talles')} abierto={abierta === 'talles'} onClick={() => abrir('talles')}>
              <div className="partner-profile-size-grid"><label className="sheet__field"><span>{t('perfil_talle_arriba')}</span><input type="text" maxLength={120} value={form.talles.arriba ?? ''} onChange={(e) => actualizarTalle('arriba', e.target.value)} /></label><label className="sheet__field"><span>{t('perfil_talle_abajo')}</span><input type="text" maxLength={120} value={form.talles.abajo ?? ''} onChange={(e) => actualizarTalle('abajo', e.target.value)} /></label><label className="sheet__field"><span>{t('perfil_talle_zapatos')}</span><input type="text" maxLength={120} value={form.talles.zapatos ?? ''} onChange={(e) => actualizarTalle('zapatos', e.target.value)} /></label><label className="sheet__field"><span>{t('perfil_talle_otro')}</span><input type="text" maxLength={120} value={form.talles.otro ?? ''} onChange={(e) => actualizarTalle('otro', e.target.value)} /></label></div>
            </Acordeon>

            <Acordeon titulo={t('perfil_otros')} abierto={abierta === 'otros'} onClick={() => abrir('otros')}>
              <label className="sheet__field"><span>{t('perfil_ideas_regalo')}</span><textarea maxLength={500} rows={3} value={form.ideasRegalo ?? ''} onChange={(e) => actualizarCampo('ideasRegalo', e.target.value)} /></label>
              <div className="partner-profile-form__section-heading"><span className="partner-profile-form-label">{t('perfil_personalizados')}</span><button type="button" className="partner-profile-inline-button" onClick={agregarDato} disabled={form.personalizados.length >= 10}>+ {t('perfil_agregar_dato')}</button></div>
              {form.personalizados.map((dato) => <div className="partner-profile-fact-row" key={dato.id}><input type="text" maxLength={40} aria-label={t('perfil_etiqueta')} placeholder={t('perfil_etiqueta')} value={dato.etiqueta} onChange={(e) => actualizarDato(dato.id, 'etiqueta', e.target.value)} /><input type="text" maxLength={300} aria-label={t('perfil_valor')} placeholder={t('perfil_valor')} value={dato.valor} onChange={(e) => actualizarDato(dato.id, 'valor', e.target.value)} /><button type="button" className="partner-profile-fact-remove" aria-label={t('perfil_quitar_dato')} onClick={() => quitarDato(dato.id)}>×</button></div>)}
            </Acordeon>
          </div>
          <div className="partner-profile-editor__footer">{errorGuardado && <div className="onboarding__error">{errorGuardado}</div>}<button type="submit" className="sheet__submit" disabled={guardando}>{guardando ? t('comun_guardando') : t('perfil_guardar_datos')}</button><button type="button" className="partner-profile-cancel" onClick={onClose}>{t('perfil_cancelar')}</button></div>
        </form>
      </div>
    </div>
  )
}
