/** The app's waiting state, everywhere it lasts long enough to need one.
 *
 * It is the same heart, at the same size, in the same place as the one
 * `index.html` paints before React exists — so the handover from that one to
 * this one is invisible. Two different loaders back to back is what made the
 * old boot read as a stutter: a blank page, then a grey ring, then the app. */
export function Cargando({ pantalla = false }: { pantalla?: boolean }) {
  return (
    <div className={`arranque${pantalla ? ' arranque--pantalla' : ''}`} aria-hidden="true">
      <svg className="arranque__corazon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 20.4S4 14.8 4 9.4A4.8 4.8 0 0 1 8.8 4.6c1.5 0 2.7.8 3.2 1.8.5-1 1.7-1.8 3.2-1.8A4.8 4.8 0 0 1 20 9.4c0 5.4-8 11-8 11Z" />
      </svg>
    </div>
  )
}
