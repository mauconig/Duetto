import { useEffect, useState } from 'react'
import type { PerfilDatos, PerfilMiembro, ProveedorMusica } from '../lib/api'
import { useT } from '../lib/i18n/contexto'

interface PartnerProfileDetailSheetProps {
  perfil: PerfilMiembro
  propio: boolean
  onClose: () => void
  onEditar?: () => void
}

type Seccion = 'resumen' | 'talles' | 'favoritos' | 'gustos' | 'regalos' | 'otros'

function PortadaCancion({ url, titulo }: { url: string | null; titulo: string }) {
  const [fallida, setFallida] = useState(false)
  useEffect(() => setFallida(false), [url])
  if (!url || fallida) return <div className="partner-profile-detail-song__cover partner-profile-detail-song__cover--placeholder">♫</div>
  return <img className="partner-profile-detail-song__cover" src={url} alt={titulo} onError={() => setFallida(true)} />
}

function tieneCancion(cancion: PerfilDatos['cancion']): boolean {
  return Boolean(cancion.url || cancion.titulo || cancion.artista || cancion.album)
}

function tieneTalles(datos: PerfilDatos): boolean {
  return Boolean(datos.talles.arriba || datos.talles.abajo || datos.talles.zapatos || datos.talles.otro)
}

function tieneFavoritos(datos: PerfilDatos): boolean {
  return Boolean(datos.colorFavorito.nombre || datos.colorFavorito.hex || datos.comidaFavorita || datos.bebidaFavorita)
}

function tieneGustos(datos: PerfilDatos): boolean {
  return Boolean(datos.hobbies || datos.gustos || datos.disgustos)
}

function seccionInicial(datos: PerfilDatos): Seccion {
  if (tieneCancion(datos.cancion) || tieneGustos(datos)) return 'resumen'
  if (tieneTalles(datos)) return 'talles'
  if (tieneFavoritos(datos)) return 'favoritos'
  if (datos.ideasRegalo) return 'regalos'
  if (datos.personalizados.length > 0) return 'otros'
  return 'resumen'
}

function textoBusqueda(datos: PerfilDatos): string {
  return [datos.cancion.titulo, datos.cancion.artista].filter(Boolean).join(' ')
}

function enlaceBusqueda(proveedor: ProveedorMusica, texto: string): string {
  const query = encodeURIComponent(texto)
  if (proveedor === 'spotify') return `https://open.spotify.com/search/${query}`
  if (proveedor === 'apple') return `https://music.apple.com/us/search?term=${query}`
  return `https://music.youtube.com/search?q=${query}`
}

const proveedores: { id: ProveedorMusica; clave: 'perfil_cancion_proveedor_spotify' | 'perfil_cancion_proveedor_youtube' | 'perfil_cancion_proveedor_apple' }[] = [
  { id: 'spotify', clave: 'perfil_cancion_proveedor_spotify' },
  { id: 'youtube', clave: 'perfil_cancion_proveedor_youtube' },
  { id: 'apple', clave: 'perfil_cancion_proveedor_apple' },
]

function TextoExpandible({ texto, t }: { texto: string; t: ReturnType<typeof useT> }) {
  const [expandido, setExpandido] = useState(false)
  return (
    <div className="partner-profile-detail-text">
      <p className={expandido ? 'partner-profile-detail-text__body partner-profile-detail-text__body--expanded' : 'partner-profile-detail-text__body'}>{texto}</p>
      {texto.length > 150 && <button type="button" className="partner-profile-detail-text__toggle" onClick={() => setExpandido((actual) => !actual)}>{expandido ? t('perfil_ver_menos') : t('perfil_ver_mas')}</button>}
    </div>
  )
}

function Bloque({ etiqueta, children, seccion, abierta, onAbrir }: { etiqueta: string; children: React.ReactNode; seccion: Seccion; abierta: boolean; onAbrir: (seccion: Seccion) => void }) {
  return (
    <section className={`partner-profile-detail-block${abierta ? ' partner-profile-detail-block--open' : ''}`}>
      <button type="button" className="partner-profile-detail-block__trigger" aria-expanded={abierta} onClick={() => onAbrir(seccion)}>
        <span>{etiqueta}</span>
        <span aria-hidden="true">{abierta ? '−' : '+'}</span>
      </button>
      {abierta && <div className="partner-profile-detail-block__content">{children}</div>}
    </section>
  )
}

function DatosResumen({ datos, t }: { datos: PerfilDatos; t: ReturnType<typeof useT> }) {
  const cancion = tieneCancion(datos.cancion)
  const resumen = datos.gustos || datos.hobbies
  if (!cancion && !resumen) return <p className="partner-profile-detail-empty">{t('perfil_sin_datos')}</p>
  return (
    <div className="partner-profile-detail-summary">
      {cancion && (
        <div className="partner-profile-detail-song">
          <PortadaCancion url={datos.cancion.portadaUrl} titulo={datos.cancion.titulo || t('perfil_cancion_favorita')} />
          <div className="partner-profile-detail-song__info">
            {datos.cancion.titulo && <strong>{datos.cancion.titulo}</strong>}
            {datos.cancion.artista && <span>{datos.cancion.artista}</span>}
            {datos.cancion.album && <small>{datos.cancion.album}</small>}
            <div className="partner-profile-searches">
              {textoBusqueda(datos) && [...proveedores].sort((a, b) => Number(b.id === datos.proveedorMusicaPreferido) - Number(a.id === datos.proveedorMusicaPreferido)).map((proveedor) => (
                <a
                  key={proveedor.id}
                  className={`partner-profile-search${datos.proveedorMusicaPreferido === proveedor.id ? ' partner-profile-search--preferred' : ''}`}
                  href={enlaceBusqueda(proveedor.id, textoBusqueda(datos))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('perfil_buscar_en', t(proveedor.clave))}
                </a>
              ))}
            </div>
            {datos.cancion.url && <a className="partner-profile-original-link" href={datos.cancion.url} target="_blank" rel="noopener noreferrer">{t('perfil_abrir_fuente')}</a>}
          </div>
        </div>
      )}
      {resumen && <div className="partner-profile-detail-summary__taste"><span>{t('perfil_gustos')}</span><strong>{resumen}</strong></div>}
    </div>
  )
}

function DatosTalles({ datos, t }: { datos: PerfilDatos; t: ReturnType<typeof useT> }) {
  const talles = [
    { etiqueta: t('perfil_talle_arriba'), valor: datos.talles.arriba },
    { etiqueta: t('perfil_talle_abajo'), valor: datos.talles.abajo },
    { etiqueta: t('perfil_talle_zapatos'), valor: datos.talles.zapatos },
    { etiqueta: t('perfil_talle_otro'), valor: datos.talles.otro },
  ].filter((talle) => talle.valor)
  return talles.length > 0 ? <div className="partner-profile-size-grid partner-profile-size-grid--detail">{talles.map((talle) => <div className="partner-profile-size-chip" key={talle.etiqueta}><span>{talle.etiqueta}</span><strong>{talle.valor}</strong></div>)}</div> : <p className="partner-profile-detail-empty">{t('perfil_sin_datos')}</p>
}

function DatosFavoritos({ datos, t }: { datos: PerfilDatos; t: ReturnType<typeof useT> }) {
  const favoritos = [
    { etiqueta: t('perfil_color_favorito'), valor: datos.colorFavorito.nombre || datos.colorFavorito.hex, color: datos.colorFavorito.hex },
    { etiqueta: t('perfil_comida_favorita'), valor: datos.comidaFavorita },
    { etiqueta: t('perfil_bebida_favorita'), valor: datos.bebidaFavorita },
  ].filter((favorito) => favorito.valor)
  return favoritos.length > 0 ? <div className="partner-profile-detail-list">{favoritos.map((favorito) => <div className="partner-profile-detail-list__row" key={favorito.etiqueta}><span>{favorito.color && <i className="partner-profile-color-dot" style={{ backgroundColor: favorito.color }} />} {favorito.etiqueta}</span><strong>{favorito.valor}</strong></div>)}</div> : <p className="partner-profile-detail-empty">{t('perfil_sin_datos')}</p>
}

function DatosGustos({ datos, t }: { datos: PerfilDatos; t: ReturnType<typeof useT> }) {
  const textos = [
    { etiqueta: t('perfil_hobbies'), valor: datos.hobbies },
    { etiqueta: t('perfil_gustos'), valor: datos.gustos },
    { etiqueta: t('perfil_disgustos'), valor: datos.disgustos },
  ].filter((texto) => texto.valor)
  return textos.length > 0 ? <div className="partner-profile-detail-text-list">{textos.map((texto) => <div key={texto.etiqueta}><span>{texto.etiqueta}</span><TextoExpandible texto={texto.valor!} t={t} /></div>)}</div> : <p className="partner-profile-detail-empty">{t('perfil_sin_datos')}</p>
}

function DatosRegalos({ datos, t }: { datos: PerfilDatos; t: ReturnType<typeof useT> }) {
  if (!datos.ideasRegalo) return <p className="partner-profile-detail-empty">{t('perfil_sin_datos')}</p>
  return <div className="partner-profile-detail-text-list"><div><span>{t('perfil_ideas_regalo')}</span><TextoExpandible texto={datos.ideasRegalo} t={t} /></div></div>
}

function DatosOtros({ datos, t }: { datos: PerfilDatos; t: ReturnType<typeof useT> }) {
  const bloques = datos.personalizados.map((dato) => ({ etiqueta: dato.etiqueta, valor: dato.valor }))
  return bloques.length > 0 ? <div className="partner-profile-detail-text-list">{bloques.map((bloque) => <div key={bloque.etiqueta}><span>{bloque.etiqueta}</span><TextoExpandible texto={bloque.valor} t={t} /></div>)}</div> : <p className="partner-profile-detail-empty">{t('perfil_sin_datos')}</p>
}

export function PartnerProfileDetailSheet({ perfil, propio, onClose, onEditar }: PartnerProfileDetailSheetProps) {
  const t = useT()
  const datos = perfil.datos
  const [abierta, setAbierta] = useState<Seccion>(() => seccionInicial(datos))

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet sheet--perfil-detail" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <div className="sheet__header">
          <div>
            <span className="partner-profile-detail-eyebrow">{propio ? t('perfil_mis_datos') : t('perfil_datos_pareja')}</span>
            <h3>{perfil.nombre}</h3>
          </div>
          <button type="button" className="sheet__close" aria-label={t('comun_cerrar')} onClick={onClose}>×</button>
        </div>
        <div className="partner-profile-detail-blocks">
          {(tieneCancion(datos.cancion) || tieneGustos(datos)) && <Bloque etiqueta={t('perfil_resumen_cancion')} seccion="resumen" abierta={abierta === 'resumen'} onAbrir={setAbierta}><DatosResumen datos={datos} t={t} /></Bloque>}
          {tieneTalles(datos) && <Bloque etiqueta={t('perfil_talles')} seccion="talles" abierta={abierta === 'talles'} onAbrir={setAbierta}><DatosTalles datos={datos} t={t} /></Bloque>}
          {tieneFavoritos(datos) && <Bloque etiqueta={t('perfil_favoritos')} seccion="favoritos" abierta={abierta === 'favoritos'} onAbrir={setAbierta}><DatosFavoritos datos={datos} t={t} /></Bloque>}
          {tieneGustos(datos) && <Bloque etiqueta={t('perfil_gustos_disgustos')} seccion="gustos" abierta={abierta === 'gustos'} onAbrir={setAbierta}><DatosGustos datos={datos} t={t} /></Bloque>}
          {datos.ideasRegalo && <Bloque etiqueta={t('perfil_ideas_regalo')} seccion="regalos" abierta={abierta === 'regalos'} onAbrir={setAbierta}><DatosRegalos datos={datos} t={t} /></Bloque>}
          {datos.personalizados.length > 0 && <Bloque etiqueta={t('perfil_otros')} seccion="otros" abierta={abierta === 'otros'} onAbrir={setAbierta}><DatosOtros datos={datos} t={t} /></Bloque>}
        </div>
        {propio && onEditar && <button type="button" className="sheet__submit partner-profile-detail-edit" onClick={onEditar}>{t('perfil_editar_datos')}</button>}
      </div>
    </div>
  )
}
