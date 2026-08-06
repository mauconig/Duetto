import { useEffect, useRef, useState } from 'react'
import { Show } from '@clerk/react'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { Welcome } from './screens/Welcome'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Albums } from './screens/Albums'
import { Roulette } from './screens/Roulette'
import { Articles } from './screens/Articles'
import { ArticleDetail } from './screens/ArticleDetail'
import { Profile } from './screens/Profile'
import { albumes as albumesBase, articulos, ideasIniciales } from './data'
import type { Album, Articulo, Tab } from './types'
import { useApi, type Pareja } from './lib/api'
import { loadUserEntries, saveUserEntries } from './lib/userEntries'
import { loadOverrides, saveOverrides } from './lib/entryOverrides'
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
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .obtenerPareja()
      .then((p) => {
        if (!cancelado) setPareja(p)
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No pudimos conectar')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [api])

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
    return <Onboarding parejaInicial={pareja} onListo={setPareja} />
  }

  return <AppContent pareja={pareja} onActualizarPareja={setPareja} />
}

function AppContent({ pareja }: { pareja: Pareja; onActualizarPareja: (p: Pareja) => void }) {
  const [tab, setTab] = useState<Tab>('inicio')
  const [articulo, setArticulo] = useState<Articulo | null>(null)
  const [ideas, setIdeas] = useState<string[]>(ideasIniciales)
  const [nuevaIdea, setNuevaIdea] = useState('')
  const [rotacion, setRotacion] = useState(0)
  const [girando, setGirando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [entradasUsuario, setEntradasUsuario] = useState<Album[]>(() => loadUserEntries())
  const [overrides, setOverrides] = useState<Record<string, Album>>(() => loadOverrides())
  const spinTimeout = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(spinTimeout.current), [])

  const albumes = [...albumesBase, ...entradasUsuario].map((a) => overrides[a.id] ?? a)

  function crearEntrada(nueva: Album) {
    setEntradasUsuario((prev) => {
      const next = [...prev, nueva]
      saveUserEntries(next)
      return next
    })
  }

  function editarEntrada(actualizada: Album) {
    setOverrides((prev) => {
      const next = { ...prev, [actualizada.id]: actualizada }
      saveOverrides(next)
      return next
    })
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
  const ideaSugerida = pickDaily(ideas, hoy)
  const ultimoAlbum = sortByFecha(albumes).at(-1) as Album
  const albumFoto = photoSlots(ultimoAlbum)[0]

  function irInicio() {
    setTab('inicio')
  }
  function irAlbumes() {
    setTab('albumes')
  }
  function irRuleta() {
    setTab('ruleta')
  }
  function irArticulos() {
    setTab('articulos')
    setArticulo(null)
  }
  function irPerfil() {
    setTab('perfil')
  }

  function abrirRecuerdo(_r: Album) {
    setTab('albumes')
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
      setResultado(ideas[Math.floor(ang / seg) % ideas.length])
    }, 4200)
  }

  function agregarIdea() {
    const t = nuevaIdea.trim()
    if (!t) return
    setIdeas((prev) => [...prev, t])
    setNuevaIdea('')
    setResultado(null)
  }

  function borrarIdea(index: number) {
    setIdeas((prev) => prev.filter((_, j) => j !== index))
    setResultado(null)
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
          articuloDelDia={articulos[0]}
          recuerdo={recuerdo}
          ideaSugerida={ideaSugerida}
          onIrRuleta={irRuleta}
          onIrAlbumes={irAlbumes}
          onIrArticulos={irArticulos}
          onAbrirRecuerdo={abrirRecuerdo}
        />
      )}

      {tab === 'albumes' && <Albums albumes={albumes} onCrear={crearEntrada} onEditar={editarEntrada} />}

      {tab === 'ruleta' && (
        <Roulette
          ideas={ideas}
          rotacion={rotacion}
          girando={girando}
          resultado={resultado}
          nuevaIdea={nuevaIdea}
          onGirar={girar}
          onCambiarNuevaIdea={setNuevaIdea}
          onAgregarIdea={agregarIdea}
          onBorrarIdea={borrarIdea}
        />
      )}

      {tab === 'articulos' && !articulo && <Articles articulos={articulos} onAbrir={setArticulo} />}
      {tab === 'articulos' && articulo && <ArticleDetail articulo={articulo} onVolver={() => setArticulo(null)} />}

      {tab === 'perfil' && (
        <Profile
          nombres={nombres}
          inicial1={inicial1}
          inicial2={inicial2}
          fechaInicioTexto={formatFecha(ini)}
          diasJuntos={diasJuntos(hoy, ini)}
          numAlbumes={albumes.length}
          numIdeas={ideas.length}
          codigo={pareja.codigo}
          vinculada={pareja.vinculada}
        />
      )}

      <BottomNav
        active={tab}
        onChange={(next) => {
          if (next === 'inicio') irInicio()
          else if (next === 'albumes') irAlbumes()
          else if (next === 'ruleta') irRuleta()
          else if (next === 'articulos') irArticulos()
          else irPerfil()
        }}
      />
    </>
  )
}

export default App
