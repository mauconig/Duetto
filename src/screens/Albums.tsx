import { useEffect, useRef, useState } from 'react'
import { PhotoGallery } from '../components/PhotoGallery'
import { EntrySheet } from '../components/EntrySheet'
import type { Album } from '../types'
import { formatFechaEntrada, photoSlots, sortByFecha } from '../lib/duette'

interface AlbumsProps {
  albumes: Album[]
  onCrear: (entry: Album) => void
  onEditar: (entry: Album) => void
}

type SheetState = { mode: 'crear' } | { mode: 'editar'; entry: Album } | null

export function Albums({ albumes, onCrear, onEditar }: AlbumsProps) {
  const entradas = sortByFecha(albumes)
  const [fabVisible, setFabVisible] = useState(true)
  const [sheet, setSheet] = useState<SheetState>(null)
  const lastScrollY = useRef(0)

  useEffect(() => {
    lastScrollY.current = window.scrollY
    function onScroll() {
      const y = window.scrollY
      const diff = y - lastScrollY.current
      if (y < 40) setFabVisible(true)
      else if (diff > 4) setFabVisible(false)
      else if (diff < -4) setFabVisible(true)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div className="screen">
        <h2>Álbumes</h2>

        <div className="timeline">
          {entradas.map((entrada) => (
            <div className="timeline__row" key={entrada.id}>
              <div className="timeline__rail">
                <div className="timeline__dot" />
                <div className="timeline__line" />
              </div>
              <div className="timeline__content">
                <div className="timeline__fecha">{formatFechaEntrada(entrada)}</div>
                {entrada.nota && <div className="timeline__nota">{entrada.nota}</div>}
                <PhotoGallery slots={photoSlots(entrada)} fondo={entrada.fondo} onEditar={() => setSheet({ mode: 'editar', entry: entrada })} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`timeline-fab-wrap${fabVisible ? '' : ' timeline-fab-wrap--hidden'}`}>
        <button type="button" className="timeline-fab" onClick={() => setSheet({ mode: 'crear' })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {sheet && (
        <EntrySheet
          entry={sheet.mode === 'editar' ? sheet.entry : undefined}
          onClose={() => setSheet(null)}
          onGuardar={(entry) => {
            sheet.mode === 'crear' ? onCrear(entry) : onEditar(entry)
            setSheet(null)
          }}
        />
      )}
    </>
  )
}
