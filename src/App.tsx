import { useCallback, useEffect, useRef, useState } from 'react'
import { Show } from '@clerk/react'
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
import { fileToWebpBlob, PRESET_REFERENCIA } from './lib/photoStorage'
import type { Album, Tab } from './types'
import { useApi, type Categoria, type Idea, type Inspiracion as Referencia, type Pareja } from './lib/api'
import {
  calcularEdad,
  calcularHito,
  diasJuntos,
  formatFecha,
  formatFechaHoy,
  parseFecha,
  photoSlots,
  pickDaily,
  sortByFecha,
} from './lib/duette'

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
        if (!cancelado) setError(e instanceof Error ? e.message : 'No pudimos conectar')
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
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
          Reintentar
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

  // The inspiración board. Fetched up front rather than on first visit: the
  // payload is only ids and category names, and the card on Inicio counts
  // what's in it — deferring the fetch would have that card claim the board
  // is empty until the tab happened to be opened.
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [referencias, setReferencias] = useState<Referencia[]>([])
  const [subiendo, setSubiendo] = useState(0)
  const [errorTablero, setErrorTablero] = useState<string | null>(null)

  useEffect(() => () => window.clearTimeout(spinTimeout.current), [])

  // Read the cache rather than the URL: if the share had to go through
  // sign-in first, the query string is long gone but the files are not.
  useEffect(() => {
    let cancelado = false
    recogerFotosCompartidas().then((fotos) => {
      if (!cancelado && fotos.length > 0) setCompartidas(fotos)
    })
    return () => {
      cancelado = true
    }
  }, [])

  async function cerrarCompartido() {
    setCompartidas([])
    setDestino(null)
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
        if (!cancelado) setErrorTablero(e instanceof Error ? e.message : 'No pudimos cargar la inspiración')
      })
    return () => {
      cancelado = true
    }
  }, [api])

  /** Downscale, stage, then claim onto the board — the same two steps the
   * recuerdo sheet uses, at reference sizes instead of camera ones. */
  const guardarReferencias = useCallback(
    async (archivos: File[], categoriaId: string | null) => {
      if (archivos.length === 0) return
      setErrorTablero(null)
      setSubiendo((n) => n + archivos.length)
      for (const archivo of archivos) {
        try {
          const foto = await fileToWebpBlob(archivo, PRESET_REFERENCIA)
          const stagedId = await api.subirFoto(foto)
          const guardada = await api.guardarInspiracion(stagedId, categoriaId)
          setReferencias((prev) => [guardada, ...prev])
        } catch (e) {
          setErrorTablero(e instanceof Error ? e.message : 'No pudimos guardar la foto')
        } finally {
          setSubiendo((n) => n - 1)
        }
      }
    },
    [api],
  )

  async function conErrorDelTablero(fn: () => Promise<void>) {
    setErrorTablero(null)
    try {
      await fn()
    } catch (e) {
      setErrorTablero(e instanceof Error ? e.message : 'Algo salió mal')
    }
  }

  const propio = pareja.nombrePropio ?? 'Vos'
  // Until the other partner enters the code there's only one name to show.
  const nombres = pareja.nombrePareja ? `${propio} & ${pareja.nombrePareja}` : propio
  const hoy = new Date()
  const ini = parseFecha(pareja.fechaAniversario!)
  const edad = calcularEdad(hoy, ini)
  const hito = calcularHito(hoy, ini, pareja.proximoHito!)
  const inicial1 = propio[0]
  const inicial2 = pareja.nombrePareja?.[0] ?? '+'
  const recuerdo = pickDaily(albumes, hoy)
  const ideaSugerida = pickDaily(ideas, hoy)?.texto ?? null
  // Undefined until the couple adds their first memory — Home hides the
  // album cards in that case.
  const ultimoAlbum = sortByFecha(albumes).at(-1)
  const albumFoto = ultimoAlbum ? photoSlots(ultimoAlbum)[0] : undefined

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
    const t = nuevaIdea.trim()
    if (!t || ideaEnCurso) return
    setIdeaEnCurso(true)
    setErrorIdea(null)
    try {
      const idea = await api.agregarIdea(t)
      onIdeasCambiadas([...ideas, idea])
      setNuevaIdea('')
      setResultado(null)
    } catch (err) {
      setErrorIdea(err instanceof Error ? err.message : 'No pudimos guardar la idea')
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
      setErrorIdea(err instanceof Error ? err.message : 'No pudimos borrar la idea')
    } finally {
      setIdeaEnCurso(false)
    }
  }

  return (
    <>
      {tab === 'inicio' && (
        <Home
          nombres={nombres}
          fechaHoy={formatFechaHoy(hoy)}
          inicial1={inicial1}
          inicial2={inicial2}
          fechaInicioTexto={formatFecha(ini)}
          edad={edad}
          hito={hito}
          ultimoAlbum={ultimoAlbum}
          albumFoto={albumFoto}
          numInspiraciones={referencias.length}
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
          onCrearCategoria={(nombre) =>
            conErrorDelTablero(async () => {
              const c = await api.crearCategoria(nombre)
              setCategorias((prev) => [...prev, c])
            })
          }
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
          fechaInicioTexto={formatFecha(ini)}
          diasJuntos={diasJuntos(hoy, ini)}
          numAlbumes={albumes.length}
          numIdeas={ideas.length}
          codigo={pareja.codigo}
          vinculada={pareja.vinculada}
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

      {compartidas.length > 0 && !destino && (
        <SharedPhotosSheet
          fotos={compartidas}
          albumes={albumes}
          onNuevo={() => setDestino({})}
          onExistente={(entry) => setDestino({ entry })}
          onInspiracion={async () => {
            const archivos = compartidas
            // Clear first: the upload runs on its own and the sheet has no
            // reason to sit there while it does.
            await cerrarCompartido()
            setTab('inspiracion')
            // Straight to "Sin categoría" — asking where it goes before the
            // photo is even on screen is a question with no picture attached.
            await guardarReferencias(archivos, null)
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
