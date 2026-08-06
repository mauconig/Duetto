import { useEffect, useRef, useState } from 'react'
import { useUser, Show } from '@clerk/react'
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
import type { PerfilPareja } from './lib/perfilPareja'
import { perfilCompleto } from './lib/perfilPareja'
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
  const { user } = useUser()
  const rawMeta = user?.unsafeMetadata as Record<string, unknown> | undefined
  const perfil: PerfilPareja | null = perfilCompleto(rawMeta) ? rawMeta : null

  return (
    <div className="app">
      <div className="duette">
        <Show when="signed-out">
          <Welcome />
        </Show>
        <Show when="signed-in">{perfil ? <AppContent perfil={perfil} /> : <Onboarding />}</Show>
      </div>
    </div>
  )
}

function AppContent({ perfil }: { perfil: PerfilPareja }) {
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

  const nombres = `${perfil.nombrePropio} & ${perfil.nombrePareja}`
  const hoy = new Date()
  const ini = parseFecha(perfil.fechaAniversario)
  const edad = calcularEdad(hoy, ini)
  const hito = calcularHito(hoy, ini, perfil.proximoHito)
  const inicial1 = perfil.nombrePropio[0]
  const inicial2 = perfil.nombrePareja[0]
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
