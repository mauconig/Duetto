import { useMemo, useRef, useState } from 'react'
import { TimelineLightbox } from '../components/TimelineLightbox'
import { photoUrl } from '../lib/photoStorage'
import type { Categoria, Inspiracion as Referencia } from '../lib/api'
import type { PhotoSlot } from '../lib/duette'
import { useT } from '../lib/i18n/contexto'

/** The bucket for photos with no category, and for those whose category was
 * deleted. Not a row in the database — it only exists on screen. */
const SIN_CATEGORIA = '__sin__'

interface InspiracionProps {
  categorias: Categoria[]
  fotos: Referencia[]
  /** True while photos picked from the gallery are still on their way up. */
  subiendo: number
  error: string | null
  onAgregarFotos: (archivos: FileList | null, categoriaId: string | null) => void
  /** Rejects with a message meant for the user: the link sheet shows it in
   * place and stays open, because a bad link is something you fix by editing
   * it rather than by starting over. */
  onAgregarEnlace: (url: string, categoriaId: string | null) => Promise<void>
  onCrearCategoria: (nombre: string) => Promise<void>
  onRenombrarCategoria: (id: string, nombre: string) => Promise<void>
  onBorrarCategoria: (id: string) => Promise<void>
  onMoverFoto: (id: string, categoriaId: string | null) => Promise<void>
  onBorrarFoto: (id: string) => Promise<void>
}

export function Inspiracion({
  categorias,
  fotos,
  subiendo,
  error,
  onAgregarFotos,
  onAgregarEnlace,
  onCrearCategoria,
  onRenombrarCategoria,
  onBorrarCategoria,
  onMoverFoto,
  onBorrarFoto,
}: InspiracionProps) {
  const t = useT()
  const [activa, setActiva] = useState<string>(SIN_CATEGORIA)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [nombrando, setNombrando] = useState<{ id?: string; valor: string } | null>(null)
  const [gestionando, setGestionando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The + used to open the gallery straight away. It asks first now because
  // on iPhone there is no other way in: Safari doesn't implement Web Share
  // Target, so sharing a pin into the app — how this was meant to work —
  // never reaches iOS at all.
  const [eligiendoOrigen, setEligiendoOrigen] = useState(false)
  const [enlace, setEnlace] = useState<{ valor: string; error: string | null; cargando: boolean } | null>(null)

  // "Todas" first so a board with one category still reads as a board.
  const pestanas = useMemo(
    () => [{ id: SIN_CATEGORIA, nombre: t('insp_tab_todas') }, ...categorias],
    [categorias, t],
  )
  const visibles = useMemo(
    () => (activa === SIN_CATEGORIA ? fotos : fotos.filter((f) => f.categoriaId === activa)),
    [fotos, activa],
  )
  const slots: PhotoSlot[] = useMemo(
    () =>
      visibles.map((f) => ({
        id: f.id,
        src: photoUrl(f.id),
        miniatura: photoUrl(f.id, 'miniatura'),
        esVideo: f.esVideo,
        urlOrigen: f.urlOrigen,
      })),
    [visibles],
  )

  const sinCategoria = fotos.filter((f) => f.categoriaId === null).length
  const categoriaDestino = activa === SIN_CATEGORIA ? null : activa

  async function traerDelEnlace() {
    const url = enlace?.valor.trim()
    if (!url || enlace?.cargando) return
    setEnlace({ valor: url, error: null, cargando: true })
    try {
      await onAgregarEnlace(url, categoriaDestino)
      setEnlace(null)
    } catch (e) {
      setEnlace({ valor: url, error: e instanceof Error ? e.message : t('comun_algo_salio_mal'), cargando: false })
    }
  }

  /** iOS shows its own confirmation before handing the clipboard over, so
   * this can't paste behind the user's back. When it's blocked — or the
   * browser has no clipboard API — the field is still there to type into. */
  async function pegarDelPortapapeles() {
    try {
      const texto = await navigator.clipboard.readText()
      if (texto.trim()) setEnlace({ valor: texto.trim(), error: null, cargando: false })
    } catch {
      // Denied or unsupported. Nothing to say: the input is the fallback.
    }
  }

  async function confirmarNombre() {
    const valor = nombrando?.valor.trim()
    if (!valor) return setNombrando(null)
    if (nombrando?.id) await onRenombrarCategoria(nombrando.id, valor)
    else await onCrearCategoria(valor)
    setNombrando(null)
  }

  return (
    <>
      <div className="screen">
        <div>
          <h2>{t('nav_inspiracion')}</h2>
          <div className="page-subtitle">{t('insp_subtitulo')}</div>
        </div>

        <div className="insp-tabs">
          {pestanas.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`insp-tab${activa === c.id ? ' insp-tab--activa' : ''}`}
              onClick={() => setActiva(c.id)}
            >
              {c.nombre}
              {c.id === SIN_CATEGORIA ? ` · ${fotos.length}` : ` · ${fotos.filter((f) => f.categoriaId === c.id).length}`}
            </button>
          ))}
          {/* Creating sat two taps inside "Editar", behind a word that says
              nothing about making anything. Making a carpeta is the ordinary
              thing here — renaming and deleting are the rare ones. */}
          <button
            type="button"
            className="insp-tab insp-tab--nueva"
            aria-label={t('insp_nueva_carpeta')}
            onClick={() => setNombrando({ valor: '' })}
          >
            +
          </button>
          <button type="button" className="insp-tab insp-tab--gestion" onClick={() => setGestionando((v) => !v)}>
            {gestionando ? t('insp_listo') : t('insp_editar')}
          </button>
        </div>

        {gestionando && (
          <div className="insp-gestion">
            {categorias.map((c) => (
              <div className="insp-gestion__fila" key={c.id}>
                <span className="insp-gestion__nombre">{c.nombre}</span>
                <button type="button" onClick={() => setNombrando({ id: c.id, valor: c.nombre })}>
                  {t('comun_renombrar')}
                </button>
                <button type="button" className="insp-gestion__borrar" onClick={() => onBorrarCategoria(c.id)}>
                  {t('comun_borrar')}
                </button>
              </div>
            ))}
            <p className="sheet__hint">{t('insp_borrar_carpeta_hint')}</p>
            <button type="button" className="insp-gestion__nueva" onClick={() => setNombrando({ valor: '' })}>
              + {t('insp_nueva_carpeta')}
            </button>
          </div>
        )}

        {sinCategoria > 0 && activa === SIN_CATEGORIA && categorias.length > 0 && (
          <p className="sheet__hint">{t('insp_fotos_sin_carpeta', sinCategoria)}</p>
        )}

        {error && <div className="onboarding__error">{error}</div>}
        {subiendo > 0 && <div className="insp-subiendo">{t('insp_subiendo', subiendo)}</div>}

        {visibles.length === 0 && subiendo === 0 && (
          <div className="timeline-vacio">
            <div className="timeline-vacio__icono">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--vacio-icono)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2Z" />
              </svg>
            </div>
            <div className="timeline-vacio__titulo">{t('insp_vacio_titulo')}</div>
            <p className="timeline-vacio__texto">{t('insp_vacio_texto')}</p>
          </div>
        )}

        {/* No play badge of our own on a video: the cover image arrives with
            Pinterest's already drawn into it, and a second one stacked on top
            just looks like a mistake. The way back to the pin lives in the
            lightbox instead. */}
        <div className="insp-grid">
          {visibles.map((foto, i) => (
            <button type="button" className="insp-celda" key={foto.id} onClick={() => setAbierta(i)}>
              <img src={photoUrl(foto.id, 'miniatura')} alt={foto.nota ?? ''} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-fab-wrap">
        <button type="button" className="timeline-fab" onClick={() => setEligiendoOrigen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onAgregarFotos(e.target.files, categoriaDestino)
          e.target.value = ''
        }}
      />

      {eligiendoOrigen && (
        <div className="sheet-backdrop" onClick={() => setEligiendoOrigen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <div className="sheet__header">
              <h3>{t('insp_agregar_titulo')}</h3>
              <button
                type="button"
                className="sheet__close"
                aria-label={t('comun_cerrar')}
                onClick={() => setEligiendoOrigen(false)}
              >
                ×
              </button>
            </div>
            <div className="sheet__form">
              <button
                type="button"
                className="compartir-opcion"
                onClick={() => {
                  setEligiendoOrigen(false)
                  fileInputRef.current?.click()
                }}
              >
                <span className="compartir-opcion__icono">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </span>
                <span className="compartir-opcion__texto">
                  <span className="compartir-opcion__titulo">{t('insp_desde_galeria')}</span>
                  <span className="compartir-opcion__fecha">{t('insp_desde_galeria_hint')}</span>
                </span>
              </button>

              <button
                type="button"
                className="compartir-opcion"
                onClick={() => {
                  setEligiendoOrigen(false)
                  setEnlace({ valor: '', error: null, cargando: false })
                }}
              >
                <span className="compartir-opcion__icono">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <span className="compartir-opcion__texto">
                  <span className="compartir-opcion__titulo">{t('insp_desde_enlace')}</span>
                  <span className="compartir-opcion__fecha">{t('insp_desde_enlace_hint')}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {enlace && (
        <div className="sheet-backdrop" onClick={() => !enlace.cargando && setEnlace(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <div className="sheet__header">
              <h3>{t('insp_enlace_titulo')}</h3>
              <button
                type="button"
                className="sheet__close"
                aria-label={t('comun_cerrar')}
                onClick={() => setEnlace(null)}
              >
                ×
              </button>
            </div>
            <form
              className="sheet__form"
              onSubmit={(e) => {
                e.preventDefault()
                traerDelEnlace()
              }}
            >
              <label className="sheet__field">
                <span>{t('insp_enlace_campo')}</span>
                <div className="enlace-campo">
                  {/* type="url" would make the browser reject a pasted link
                      with stray whitespace before this ever sees it, and the
                      server is the one that decides what's openable anyway. */}
                  <input
                    type="text"
                    inputMode="url"
                    autoFocus
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={enlace.valor}
                    placeholder="https://pin.it/..."
                    disabled={enlace.cargando}
                    onChange={(e) => setEnlace({ ...enlace, valor: e.target.value, error: null })}
                  />
                  <button
                    type="button"
                    className="enlace-campo__pegar"
                    disabled={enlace.cargando}
                    onClick={pegarDelPortapapeles}
                  >
                    {t('insp_enlace_pegar')}
                  </button>
                </div>
              </label>
              {enlace.error && <div className="onboarding__error">{enlace.error}</div>}
              <p className="sheet__hint">{t('insp_enlace_ayuda')}</p>
              <button type="submit" className="sheet__submit" disabled={!enlace.valor.trim() || enlace.cargando}>
                {enlace.cargando ? t('insp_enlace_buscando') : t('insp_enlace_buscar')}
              </button>
            </form>
          </div>
        </div>
      )}

      {nombrando && (
        <div className="sheet-backdrop" onClick={() => setNombrando(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <div className="sheet__header">
              <h3>{nombrando.id ? t('insp_renombrar_carpeta_titulo') : t('insp_nueva_carpeta')}</h3>
              <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={() => setNombrando(null)}>
                ×
              </button>
            </div>
            <form
              className="sheet__form"
              onSubmit={(e) => {
                e.preventDefault()
                confirmarNombre()
              }}
            >
              <label className="sheet__field">
                <span>{t('comun_nombre')}</span>
                <input
                  type="text"
                  autoFocus
                  maxLength={30}
                  value={nombrando.valor}
                  placeholder={t('insp_nombre_placeholder')}
                  onChange={(e) => setNombrando({ ...nombrando, valor: e.target.value })}
                />
              </label>
              <button type="submit" className="sheet__submit" disabled={!nombrando.valor.trim()}>
                {t('comun_guardar')}
              </button>
            </form>
          </div>
        </div>
      )}

      {abierta !== null && slots[abierta] && (
        <InspiracionAbierta
          fotos={visibles}
          slots={slots}
          indice={abierta}
          categorias={categorias}
          onIndice={setAbierta}
          onCerrar={() => setAbierta(null)}
          onMover={onMoverFoto}
          onBorrar={async (id) => {
            setAbierta(null)
            await onBorrarFoto(id)
          }}
        />
      )}
    </>
  )
}

interface AbiertaProps {
  fotos: Referencia[]
  slots: PhotoSlot[]
  indice: number
  categorias: Categoria[]
  onIndice: (i: number) => void
  onCerrar: () => void
  onMover: (id: string, categoriaId: string | null) => Promise<void>
  onBorrar: (id: string) => Promise<void>
}

/** The viewer, plus the two things you'd want while looking at a reference:
 * file it somewhere, or get rid of it. Both act on `indice` rather than on
 * whatever was tapped, so swiping to another photo first still does the
 * right thing. */
function InspiracionAbierta({ fotos, slots, indice, categorias, onIndice, onCerrar, onMover, onBorrar }: AbiertaProps) {
  const t = useT()
  const [archivando, setArchivando] = useState(false)
  const foto = fotos[indice]

  if (archivando) {
    return (
      <div className="sheet-backdrop" onClick={() => setArchivando(false)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet__handle" />
          <div className="sheet__header">
            <h3>{t('insp_archivar_en')}</h3>
            <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={() => setArchivando(false)}>
              ×
            </button>
          </div>
          <div className="sheet__form">
            {categorias.length === 0 && <p className="sheet__hint">{t('insp_sin_carpetas')}</p>}
            {categorias.map((c) => (
              <button
                type="button"
                className={`compartir-opcion${foto.categoriaId === c.id ? ' compartir-opcion--nueva' : ''}`}
                key={c.id}
                onClick={async () => {
                  await onMover(foto.id, c.id)
                  setArchivando(false)
                  onCerrar()
                }}
              >
                <span className="compartir-opcion__titulo">{c.nombre}</span>
              </button>
            ))}
            {foto.categoriaId && (
              <button
                type="button"
                className="sheet__cancelar sheet__cancelar--ancho"
                onClick={async () => {
                  await onMover(foto.id, null)
                  setArchivando(false)
                  onCerrar()
                }}
              >
                {t('insp_sacar_de_carpeta')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <TimelineLightbox
      slots={slots}
      startIndex={indice}
      onIndice={onIndice}
      onClose={onCerrar}
      etiquetaEditar={t('insp_archivar')}
      onEditar={() => setArchivando(true)}
      onBorrar={() => onBorrar(foto.id)}
    />
  )
}
