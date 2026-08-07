/** Sizes, quality and geometry shared by the worker and the main-thread
 * fallback in photoStorage.ts. Kept in their own module so the two paths
 * can't drift into producing different photos, and so the worker can import
 * them without pulling in anything that touches `document`. */

export interface Preset {
  maxDim: number
  calidad: number
  maxDimMin: number
  calidadMin: number
}

/** Photos of their own life. Downscaled in the browser before upload: it
 * keeps the server free of an image library, and saves a lot of mobile data
 * compared with sending a 3-10MB original straight off the camera.
 *
 * The 800px copy exists because the timeline draws its biggest photo about
 * 220px wide, and handing those slots the full 2500px file costs roughly
 * 240ms to decode and 19MB of memory each — twenty on screen is what made
 * scrolling stutter. */
export const PRESET_RECUERDO: Preset = { maxDim: 2500, calidad: 0.9, maxDimMin: 800, calidadMin: 0.82 }

/** Saved references — screenshots, pins, things found online. Nobody zooms
 * into one looking for detail the way they do with their own photos, and
 * they arrive already compressed, so full camera resolution would just be
 * disk spent on re-encoding someone else's JPEG artefacts. */
export const PRESET_REFERENCIA: Preset = { maxDim: 1600, calidad: 0.85, maxDimMin: 400, calidadMin: 0.8 }

export interface FotoProcesada {
  completa: Blob
  miniatura: Blob
}

/** Longest edge capped at `maxDim`, never upscaled. */
export function medidas(ancho: number, alto: number, maxDim: number): { w: number; h: number } {
  const escala = Math.min(1, maxDim / Math.max(ancho, alto))
  return {
    w: Math.max(1, Math.round(ancho * escala)),
    h: Math.max(1, Math.round(alto * escala)),
  }
}

/** Re-encoding through a canvas drops the EXIF orientation tag, so the
 * decode has to bake the rotation in — otherwise portrait phone photos are
 * stored permanently sideways. */
export const OPCIONES_BITMAP: ImageBitmapOptions = { imageOrientation: 'from-image' }
