/** The app's waiting state, everywhere it lasts long enough to need one.
 *
 * It is the same mark, at the same size, in the same place as the one
 * `index.html` paints before React exists — so the handover from that one to
 * this one is invisible. Two different loaders back to back is what made the
 * old boot read as a stutter: a blank page, then a grey ring, then the app.
 *
 * The mark lives in `/logo-marca.svg` and is pulled in as a CSS mask, so it
 * exists once rather than being pasted here and into index.html as well — and
 * takes the theme's accent, which an <img> could not. */
export function Cargando({ pantalla = false }: { pantalla?: boolean }) {
  return (
    <div className={`arranque${pantalla ? ' arranque--pantalla' : ''}`} aria-hidden="true">
      <div className="arranque__logo" />
    </div>
  )
}
