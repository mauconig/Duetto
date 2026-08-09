import { useCallback, useEffect, useRef, useState } from 'react'
import { Show, useUser } from '@clerk/react'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { Welcome } from './screens/Welcome'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Albums } from './screens/Albums'
import { Roulette } from './screens/Roulette'
import { Inspiracion } from './screens/Inspiracion'
import { Profile } from './screens/Profile'
import { SettingsSheet } from './components/SettingsSheet'
import { LeaveCoupleSheet } from './components/LeaveCoupleSheet'
import { SharedPhotosSheet } from './components/SharedPhotosSheet'
import { EntrySheet } from './components/EntrySheet'
import { TimelineLightbox } from './components/TimelineLightbox'
import { limpiarFotosCompartidas, recogerFotosCompartidas } from './lib/compartir'
import { fileToWebpBlob, photoUrl, PRESET_REFERENCIA } from './lib/photoStorage'
import type { Album, Tab } from './types'
import { useApi, type Categoria, type Idea, type Inspiracion as Referencia, type Pareja } from './lib/api'
import {
  calcularEdad,
  calcularHito,
  diasJuntos,
  formatFecha,
  formatFechaHoy,
  hitoDeHoy,
  parseFecha,
  photoSlots,
  pickDaily,
  sortByFecha,
} from './lib/duette'
import { Celebracion } from './components/Celebracion'
import { useIdiomaContexto } from './lib/i18n/contexto'
import { traducirError } from './lib/i18n/erroresServidor'

/** The last milestone this device threw confetti for. */
const HITO_CELEBRADO = 'pictogether:hito-celebrado'

/** Read once at load, so navigating around doesn't re-trigger it. Its clave
 * is never stored, so the preview can be opened as many times as needed. */
const PREVISUALIZAR_HITO = new URLSearchParams(window.location.search).has('celebrar')

function App() {
  return (
    <div className="app">
      <div className="duette">
        <Show when="signed-out">
          <Welcome />
        </Show>
        <Show when="signed-in">
          <SignedInApp />
        </Show>
      </div>
    </div>
  )
}

/** Loads the couple from the API and decides between onboarding and the
 * app itself. Mounted only when signed in, so the token is available. */
function SignedInApp() {
  const api = useApi()
  const { t } = useIdiomaContexto()
  const [pareja, setPareja] = useState<Pareja | null>(null)
  const [albumes, setAlbumes] = useState<Album[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        // The cookie has to exist before any <img> asks for a photo.
        await api.iniciarSesionFotos()
        const p = await api.obtenerPareja()
        if (cancelado) return
        setPareja(p)
        if (p) {
          const [entradas, listaIdeas] = await Promise.all([api.obtenerEntradas(), api.obtenerIdeas()])
          if (!cancelado) {
            setAlbumes(entradas)
            setIdeas(listaIdeas)
          }
        }
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? traducirError(e.message, t) : t('app_error_conectar'))
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
    // `t` deliberately left out: it only matters inside the error branch,
    // and this load runs exactly once — switching language mid-request
    // shouldn't refetch the couple, it should just leave the message in
    // whatever language it already loaded in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  function alCrear(nueva: Album) {
    setAlbumes((prev) => [...prev, nueva])
  }

  function alEditar(actualizada: Album) {
    setAlbumes((prev) => prev.map((a) => (a.id === actualizada.id ? actualizada : a)))
  }

  function alBorrar(id: string) {
    setAlbumes((prev) => prev.filter((a) => a.id !== id))
  }

  /** The couple only exists once onboarding finishes, so its seeded
   * roulette can only be fetched now — the initial load ran before it. */
  async function alTerminarOnboarding(p: Pareja) {
    setPareja(p)
    try {
      setIdeas(await api.obtenerIdeas())
    } catch {
      // An empty wheel is recoverable: a reload picks the ideas up.
    }
  }

  /** Back to a clean slate: the couple's data is either gone or no longer
   * ours to show, and onboarding takes over from here. */
  function alDesvincular() {
    setPareja(null)
    setAlbumes([])
    setIdeas([])
  }

  if (cargando) {
    return (
      <div className="screen app-loading">
        <div className="app-loading__spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen app-loading">
        <div className="onboarding__error">{error}</div>
        <button type="button" className="sheet__submit" onClick={() => window.location.reload()}>
          {t('app_reintentar')}
        </button>
      </div>
    )
  }

  const listo = pareja?.fechaAniversario && pareja.proximoHito
  if (!listo) {
    return <Onboarding parejaInicial={pareja} onListo={alTerminarOnboarding} />
  }

  return (
    <AppContent
      pareja={pareja}
      albumes={albumes}
      ideas={ideas}
      onCrear={alCrear}
      onEditar={alEditar}
      onBorrar={alBorrar}
      onIdeasCambiadas={setIdeas}
      onActualizarPareja={setPareja}
      onDesvincular={alDesvincular}
    />
  )
}

interface AppContentProps {
  pareja: Pareja
  albumes: Album[]
  ideas: Idea[]
  onCrear: (entry: Album) => void
  onEditar: (entry: Album) => void
  onBorrar: (id: string) => void
  onIdeasCambiadas: (ideas: Idea[]) => void
  onActualizarPareja: (p: Pareja) => void
  onDesvincular: () => void
}

function AppContent({
  pareja,
  albumes,
  ideas,
  onCrear,
  onEditar,
  onBorrar,
  onIdeasCambiadas,
  onActualizarPareja,
  onDesvincular,
}: AppContentProps) {
  const api = useApi()
  const { t, resuelto } = useIdiomaContexto()
  // Our own avatar comes straight from Clerk, which fills it in from Google
  // on sign-in and updates it when we upload a new one. hasImage is what
  // separates a real photo from the initials-on-a-colour that Clerk
  // generates, which we would rather draw ourselves.
  const { user } = useUser()
  const imagenPropia = user?.hasImage ? user.imageUrl : null
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false)
  const [desvinculando, setDesvinculando] = useState(false)
  const [tab, setTab] = useState<Tab>('inicio')
  // The recuerdo whose photos a card on Inicio opened full screen, and the
  // one its "Editar recuerdo" button then hands over to the sheet.
  const [recuerdoAbierto, setRecuerdoAbierto] = useState<Album | null>(null)
  const [editando, setEditando] = useState<Album | null>(null)
  const [nuevaIdea, setNuevaIdea] = useState('')
  const [ideaEnCurso, setIdeaEnCurso] = useState(false)
  const [errorIdea, setErrorIdea] = useState<string | null>(null)
  const [rotacion, setRotacion] = useState(0)
  const [girando, setGirando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const spinTimeout = useRef<number | undefined>(undefined)

  // Photos shared in from Android. `destino` is null while the user is still
  // choosing where they go, then `{}` for a brand-new recuerdo or `{entry}`
  // for an existing one. The board takes its photos without going through
  // here — there's no sheet to open for it.
  const [compartidas, setCompartidas] = useState<File[]>([])
  const [destino, setDestino] = useState<{ entry?: Album } | null>(null)
  // A shared *link* — what Pinterest sends instead of a file — takes a round
  // trip through the server before there's anything to show. Without this the
  // app would sit there looking like the share did nothing.
  const [resolviendoEnlace, setResolviendoEnlace] = useState(false)
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null)
  // Set whenever the share resolved to a Pinterest pin, whatever it's a
  // photo of or a video — so anything saved from Pinterest can link back to
  // the pin it came from. `enlaceEsVideo` only still matters for the cover
  // frame case: Pinterest hands that over either way, so it never told the
  // client anything by itself.
  const [enlaceEsVideo, setEnlaceEsVideo] = useState(false)
  const [enlaceOrigen, setEnlaceOrigen] = useState<string | null>(null)

  // Which milestone this device has already celebrated. Read once: a
  // celebration that came back on every render would be a strobe light, and
  // one that came back on every app open that day would be a nag.
  const [hitoCelebrado, setHitoCelebrado] = useState(() => {
    try {
      return localStorage.getItem(HITO_CELEBRADO) ?? ''
    } catch {
      // Private mode, or storage turned off. The celebration then shows once
      // per load, which beats never showing it.
      return ''
    }
  })

  function marcarHitoCelebrado(clave: string) {
    setHitoCelebrado(clave)
    // The preview is meant to be repeatable, so it never records itself as
    // spent — otherwise looking at it once would be the last time.
    if (PREVISUALIZAR_HITO) return
    try {
      localStorage.setItem(HITO_CELEBRADO, clave)
    } catch {
      // Same as above: nothing to do, and nothing worth interrupting for.
    }
  }

  // The inspiración board. Fetched up front rather than on first visit: the
  // payload is only ids and category names, and the card on Inicio counts
  // what's in it — deferring the fetch would have that card claim the board
  // is empty until the tab happened to be opened.
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [referencias, setReferencias] = useState<Referencia[]>([])
  const [subiendo, setSubiendo] = useState(0)
  const [errorTablero, setErrorTablero] = useState<string | null>(null)

  useEffect(() => () => window.clearTimeout(spinTimeout.current), [])

  // Clerk knows our avatar; the partner's device doesn't. Push it once per
  // change so their app has something to show. Skipped when it hasn't
  // moved, so opening the app repeatedly isn't a write each time.
  const imagenEnviada = useRef<string | null>(null)
  useEffect(() => {
    const valor = imagenPropia ?? ''
    if (imagenEnviada.current === valor) return
    imagenEnviada.current = valor
    api.guardarImagenPropia(valor).catch(() => {
      // Nothing to tell anyone: the partner keeps seeing the previous photo,
      // or their initials. Cleared so the next open tries again.
      imagenEnviada.current = null
    })
  }, [imagenPropia, api])

  // Read the cache rather than the URL: if the share had to go through
  // sign-in first, the query string is long gone but the files are not.
  //
  // Two shapes arrive here. Gallery apps send files and there is nothing to
  // do. Pinterest sends a link to the pin, and the image behind it has to be
  // fetched by the server before the rest of the app — which only knows how
  // to deal with a File — can take over.
  useEffect(() => {
    let cancelado = false
    recogerFotosCompartidas().then(async ({ fotos, enlace }) => {
      if (cancelado) return
      if (fotos.length > 0) {
        setCompartidas(fotos)
        // A video pin arrives as *both*: Pinterest hands over a cover image
        // as a file and the pin's link alongside it. The bytes are already
        // here, so only whether it's a Pinterest link at all is still
        // missing — asked for in the background, since the sheet has
        // nothing to wait for and two taps have to happen before the answer
        // is needed.
        if (enlace) {
          api
            .infoDeEnlace(enlace)
            .then(({ esVideo }) => {
              if (cancelado) return
              setEnlaceEsVideo(esVideo)
              setEnlaceOrigen(enlace)
            })
            .catch(() => {
              // Nothing to tell anyone: the photo saves as an ordinary one,
              // which is exactly what happened before any of this existed.
            })
        }
        return
      }
      if (!enlace) return
      setResolviendoEnlace(true)
      try {
        const { archivo, esVideo } = await api.imagenDeEnlace(enlace)
        if (!cancelado) {
          setCompartidas([archivo])
          setEnlaceEsVideo(esVideo)
          setEnlaceOrigen(enlace)
        }
      } catch (e) {
        if (!cancelado) setErrorEnlace(e instanceof Error ? traducirError(e.message, t) : t('app_error_enlace'))
      } finally {
        if (!cancelado) setResolviendoEnlace(false)
      }
    })
    return () => {
      cancelado = true
    }
    // Same reasoning as the couple's own load above: `t` only feeds the
    // error branch, and this runs once per app open regardless of language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  async function cerrarCompartido() {
    setCompartidas([])
    setDestino(null)
    setErrorEnlace(null)
    setEnlaceEsVideo(false)
    setEnlaceOrigen(null)
    await limpiarFotosCompartidas()
  }

  useEffect(() => {
    let cancelado = false
    api
      .obtenerTablero()
      .then((tablero) => {
        if (cancelado) return
        setCategorias(tablero.categorias)
        setReferencias(tablero.fotos)
      })
      .catch((e) => {
        if (!cancelado) setErrorTablero(e instanceof Error ? traducirError(e.message, t) : t('app_error_cargar_inspiracion'))
      })
    return () => {
      cancelado = true
    }
    // `t` only feeds the error branch; see the couple's own load above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  /** Downscale, stage, then claim onto the board — the same two steps the
   * recuerdo sheet uses, at reference sizes instead of camera ones.
   * `origenPinterest` applies to every file in the batch, which in practice
   * means one: a share from Pinterest only ever arrives as a single photo. */
  const guardarReferencias = useCallback(
    async (
      archivos: File[],
      categoriaId: string | null,
      origenPinterest?: { esVideo: boolean; urlOrigen: string },
    ) => {
      if (archivos.length === 0) return
      setErrorTablero(null)
      setSubiendo((n) => n + archivos.length)
      for (const archivo of archivos) {
        try {
          const foto = await fileToWebpBlob(archivo, PRESET_REFERENCIA)
          const stagedId = await api.subirFoto(foto)
          const guardada = await api.guardarInspiracion(stagedId, categoriaId, undefined, origenPinterest)
          setReferencias((prev) => [guardada, ...prev])
        } catch (e) {
          setErrorTablero(e instanceof Error ? traducirError(e.message, t) : t('app_error_guardar_foto'))
        } finally {
          setSubiendo((n) => n - 1)
        }
      }
    },
    [api, t],
  )

  async function conErrorDelTablero(fn: () => Promise<void>) {
    setErrorTablero(null)
    try {
      await fn()
    } catch (e) {
      setErrorTablero(e instanceof Error ? traducirError(e.message, t) : t('comun_algo_salio_mal'))
    }
  }

  /** Creates a carpeta and hands it back. The board screen only needs the
   * list to refresh, but the share sheet needs the id: it files the photo
   * into the carpeta the user just invented, in one gesture. */
  async function crearCarpeta(nombre: string): Promise<Categoria | null> {
    setErrorTablero(null)
    try {
      const c = await api.crearCategoria(nombre)
      setCategorias((prev) => [...prev, c])
      return c
    } catch (e) {
      setErrorTablero(e instanceof Error ? traducirError(e.message, t) : t('insp_error_crear_carpeta'))
      return null
    }
  }

  const propio = pareja.nombrePropio ?? t('app_nombre_generico')
  // Until the other partner enters the code there's only one name to show.
  const nombres = pareja.nombrePareja ? `${propio} & ${pareja.nombrePareja}` : propio
  const hoy = new Date()
  const ini = parseFecha(pareja.fechaAniversario!)
  const edad = calcularEdad(hoy, ini)
  const hito = calcularHito(hoy, ini, pareja.proximoHito!)
  // A celebration that shows up one day a year is one nobody can look at
  // before the day it matters — and the day it matters is the worst possible
  // time to find out it's broken. `?celebrar=1` shows it on demand.
  const hitoHoy = PREVISUALIZAR_HITO
    ? { tipo: 'aniversario' as const, clave: 'previsualizacion', numero: 3 }
    : hitoDeHoy(hoy, ini, pareja.proximoHito!)
  // Kept per device rather than on the couple: both partners should get
  // their own confetti, and one opening the app first shouldn't spend it
  // for the other.
  const celebrando = hitoHoy !== null && hitoCelebrado !== hitoHoy.clave
  const inicial1 = propio[0]
  const inicial2 = pareja.nombrePareja?.[0] ?? '+'
  const recuerdo = pickDaily(albumes, hoy)
  const ideaSugerida = pickDaily(ideas, hoy)?.texto ?? null
  // Undefined until the couple adds their first memory — Home hides the
  // album cards in that case.
  const ultimoAlbum = sortByFecha(albumes).at(-1)
  const albumFoto = ultimoAlbum ? photoSlots(ultimoAlbum)[0] : undefined
  // Same daily pick as the recuerdo and the idea, so the three things Inicio
  // surfaces rotate together and the screen is a different screen tomorrow.
  const inspiracionDelDia = pickDaily(referencias, hoy)
  const inspiracionFoto = inspiracionDelDia
    ? {
        id: inspiracionDelDia.id,
        src: photoUrl(inspiracionDelDia.id),
        miniatura: photoUrl(inspiracionDelDia.id, 'miniatura'),
      }
    : undefined

  function irInicio() {
    setTab('inicio')
  }
  function irAlbumes() {
    setTab('albumes')
  }
  function irRuleta() {
    setTab('ruleta')
  }
  function irInspiracion() {
    setTab('inspiracion')
  }
  function irPerfil() {
    setTab('perfil')
  }

  /** Expands the recuerdo's photos in place, the same lightbox a photo in
   * Recuerdos opens. One without photos has nothing to expand, so the
   * timeline is the only place worth landing on. */
  function abrirRecuerdo(r: Album) {
    if (r.fotoIds.length > 0) setRecuerdoAbierto(r)
    else setTab('albumes')
  }

  function girar() {
    if (girando || ideas.length < 2) return
    const destino = rotacion + 1440 + Math.floor(Math.random() * 360)
    setGirando(true)
    setResultado(null)
    setRotacion(destino)
    window.clearTimeout(spinTimeout.current)
    spinTimeout.current = window.setTimeout(() => {
      const seg = 360 / ideas.length
      const ang = (360 - (destino % 360)) % 360
      setGirando(false)
      setResultado(ideas[Math.floor(ang / seg) % ideas.length].texto)
    }, 4200)
  }

  // Ideas live on the server so both partners spin the same wheel, so
  // adding and removing wait for the write before touching the list — a
  // slice that vanishes and comes back would be worse than a short pause.
  async function agregarIdea() {
    const texto = nuevaIdea.trim()
    if (!texto || ideaEnCurso) return
    setIdeaEnCurso(true)
    setErrorIdea(null)
    try {
      const idea = await api.agregarIdea(texto)
      onIdeasCambiadas([...ideas, idea])
      setNuevaIdea('')
      setResultado(null)
    } catch (err) {
      setErrorIdea(err instanceof Error ? traducirError(err.message, t) : t('ruleta_error_guardar_idea'))
    } finally {
      setIdeaEnCurso(false)
    }
  }

  async function borrarIdea(id: string) {
    if (ideaEnCurso) return
    setIdeaEnCurso(true)
    setErrorIdea(null)
    try {
      await api.borrarIdea(id)
      onIdeasCambiadas(ideas.filter((i) => i.id !== id))
      setResultado(null)
    } catch (err) {
      setErrorIdea(err instanceof Error ? traducirError(err.message, t) : t('ruleta_error_borrar_idea'))
    } finally {
      setIdeaEnCurso(false)
    }
  }

  return (
    <>
      {tab === 'inicio' && (
        <Home
          nombres={nombres}
          fechaHoy={formatFechaHoy(hoy, resuelto)}
          inicial1={inicial1}
          inicial2={inicial2}
          imagenPropia={imagenPropia}
          imagenPareja={pareja.imagenPareja}
          fechaInicioTexto={formatFecha(ini, resuelto)}
          edad={edad}
          hito={hito}
          hitoHoy={hitoHoy}
          ultimoAlbum={ultimoAlbum}
          albumFoto={albumFoto}
          numInspiraciones={referencias.length}
          inspiracionFoto={inspiracionFoto}
          recuerdo={recuerdo}
          ideaSugerida={ideaSugerida}
          onIrRuleta={irRuleta}
          onIrAlbumes={irAlbumes}
          onIrInspiracion={irInspiracion}
          onAbrirRecuerdo={abrirRecuerdo}
        />
      )}

      {tab === 'albumes' && <Albums albumes={albumes} onCrear={onCrear} onEditar={onEditar} onBorrar={onBorrar} />}

      {tab === 'ruleta' && (
        <Roulette
          ideas={ideas}
          rotacion={rotacion}
          girando={girando}
          resultado={resultado}
          nuevaIdea={nuevaIdea}
          ocupado={ideaEnCurso}
          error={errorIdea}
          onGirar={girar}
          onCambiarNuevaIdea={setNuevaIdea}
          onAgregarIdea={agregarIdea}
          onBorrarIdea={borrarIdea}
        />
      )}

      {tab === 'inspiracion' && (
        <Inspiracion
          categorias={categorias}
          fotos={referencias}
          subiendo={subiendo}
          error={errorTablero}
          onAgregarFotos={(lista, categoriaId) =>
            guardarReferencias(Array.from(lista ?? []).filter((f) => f.type.startsWith('image/')), categoriaId)
          }
          // Same round trip the share target makes, reached by hand. Only the
          // lookup rethrows: a link that can't be opened is the sheet's
          // problem to show, while a failed upload is the board's, and
          // guardarReferencias already reports those there.
          onAgregarEnlace={async (url, categoriaId) => {
            let resuelto
            try {
              resuelto = await api.imagenDeEnlace(url)
            } catch (e) {
              throw new Error(e instanceof Error ? traducirError(e.message, t) : t('app_error_enlace'))
            }
            await guardarReferencias([resuelto.archivo], categoriaId, {
              esVideo: resuelto.esVideo,
              urlOrigen: url,
            })
          }}
          onCrearCategoria={async (nombre) => {
            await crearCarpeta(nombre)
          }}
          onRenombrarCategoria={(id, nombre) =>
            conErrorDelTablero(async () => {
              const c = await api.renombrarCategoria(id, nombre)
              setCategorias((prev) => prev.map((x) => (x.id === id ? c : x)))
            })
          }
          onBorrarCategoria={(id) =>
            conErrorDelTablero(async () => {
              await api.borrarCategoria(id)
              setCategorias((prev) => prev.filter((x) => x.id !== id))
              // The server keeps the photos and clears their category; mirror
              // that here instead of refetching the whole board.
              setReferencias((prev) => prev.map((f) => (f.categoriaId === id ? { ...f, categoriaId: null } : f)))
            })
          }
          onMoverFoto={(id, categoriaId) =>
            conErrorDelTablero(async () => {
              await api.moverInspiracion(id, categoriaId)
              setReferencias((prev) => prev.map((f) => (f.id === id ? { ...f, categoriaId } : f)))
            })
          }
          onBorrarFoto={(id) =>
            conErrorDelTablero(async () => {
              await api.borrarInspiracion(id)
              setReferencias((prev) => prev.filter((f) => f.id !== id))
            })
          }
        />
      )}

      {tab === 'perfil' && (
        <Profile
          nombres={nombres}
          nombrePropio={propio}
          inicial1={inicial1}
          inicial2={inicial2}
          imagenPropia={imagenPropia}
          imagenPareja={pareja.imagenPareja}
          fechaInicioTexto={formatFecha(ini, resuelto)}
          diasJuntos={diasJuntos(hoy, ini)}
          numAlbumes={albumes.length}
          numIdeas={ideas.length}
          codigo={pareja.codigo}
          vinculada={pareja.vinculada}
          premium={pareja.premium}
          espacioUsado={pareja.espacioUsado}
          espacioLimite={pareja.espacioLimite}
          onAbrirAjustes={() => setAjustesAbiertos(true)}
          onDesvincular={() => setDesvinculando(true)}
        />
      )}

      {ajustesAbiertos && (
        <SettingsSheet
          pareja={pareja}
          onClose={() => setAjustesAbiertos(false)}
          onGuardar={(p) => {
            onActualizarPareja(p)
            setAjustesAbiertos(false)
          }}
        />
      )}

      {recuerdoAbierto && (
        <TimelineLightbox
          slots={photoSlots(recuerdoAbierto)}
          startIndex={0}
          onClose={() => setRecuerdoAbierto(null)}
          onEditar={() => {
            setEditando(recuerdoAbierto)
            setRecuerdoAbierto(null)
          }}
        />
      )}

      {editando && (
        <EntrySheet
          entry={editando}
          onClose={() => setEditando(null)}
          onGuardar={(entrada) => {
            onEditar(entrada)
            setEditando(null)
          }}
          onBorrar={(id) => {
            onBorrar(id)
            setEditando(null)
          }}
        />
      )}

      {celebrando && hitoHoy && (
        <Celebracion hito={hitoHoy} nombres={nombres} onCerrar={() => marcarHitoCelebrado(hitoHoy.clave)} />
      )}

      {(resolviendoEnlace || errorEnlace) && (
        <div className="sheet-backdrop" onClick={() => errorEnlace && cerrarCompartido()}>
          <div className="enlace-aviso" onClick={(e) => e.stopPropagation()}>
            {errorEnlace ? (
              <>
                <p className="enlace-aviso__texto">{errorEnlace}</p>
                <button type="button" className="enlace-aviso__boton" onClick={cerrarCompartido}>
                  {t('app_entendido')}
                </button>
              </>
            ) : (
              <p className="enlace-aviso__texto">{t('app_buscando_imagen')}</p>
            )}
          </div>
        </div>
      )}

      {compartidas.length > 0 && !destino && (
        <SharedPhotosSheet
          fotos={compartidas}
          albumes={albumes}
          categorias={categorias}
          onCrearCarpeta={crearCarpeta}
          onNuevo={() => setDestino({})}
          onExistente={(entry) => setDestino({ entry })}
          onInspiracion={async (categoriaId) => {
            const archivos = compartidas
            // Read before cerrarCompartido clears them. Any resolved
            // Pinterest link counts, not just a video's — the badge this
            // feeds is "see the original pin", which is just as true of a
            // photo pin.
            const origenPinterest = enlaceOrigen ? { esVideo: enlaceEsVideo, urlOrigen: enlaceOrigen } : undefined
            // Clear first: the upload runs on its own and the sheet has no
            // reason to sit there while it does.
            await cerrarCompartido()
            setTab('inspiracion')
            // The sheet asks which carpeta before we get here, and it can
            // show the photo while it asks — which is what the question was
            // missing when this used to file everything under "Sin categoría".
            await guardarReferencias(archivos, categoriaId, origenPinterest)
          }}
          onDescartar={cerrarCompartido}
        />
      )}

      {compartidas.length > 0 && destino && (
        <EntrySheet
          entry={destino.entry}
          fotosExtra={compartidas}
          onClose={() => setDestino(null)}
          onGuardar={(entrada) => {
            destino.entry ? onEditar(entrada) : onCrear(entrada)
            cerrarCompartido()
            setTab('albumes')
          }}
          onBorrar={(id) => {
            onBorrar(id)
            cerrarCompartido()
          }}
        />
      )}

      {desvinculando && (
        <LeaveCoupleSheet
          pareja={pareja}
          onClose={() => setDesvinculando(false)}
          onSalio={() => {
            setDesvinculando(false)
            onDesvincular()
          }}
        />
      )}

      <BottomNav
        active={tab}
        onChange={(next) => {
          if (next === 'inicio') irInicio()
          else if (next === 'albumes') irAlbumes()
          else if (next === 'ruleta') irRuleta()
          else if (next === 'inspiracion') irInspiracion()
          else irPerfil()
        }}
      />
    </>
  )
}

export default App
