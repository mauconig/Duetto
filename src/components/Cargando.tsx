/** The app's waiting state, everywhere it lasts long enough to need one.
 *
 * It is the same mark, at the same size, in the same place as the one
 * `index.html` paints before React exists — so the handover from that one to
 * this one is invisible. Two different loaders back to back is what made the
 * old boot read as a stutter: a blank page, then a grey ring, then the app.
 *
 * Pulled from `/favicon.svg` rather than inlined, so the logo lives in one
 * file instead of being pasted here and into index.html as well. The browser
 * has already fetched it for the tab icon by the time this shows. */
export function Cargando({ pantalla = false }: { pantalla?: boolean }) {
  return (
    <div className={`arranque${pantalla ? ' arranque--pantalla' : ''}`} aria-hidden="true">
      <img className="arranque__logo" src="/favicon.svg" alt="" />
    </div>
  )
}
