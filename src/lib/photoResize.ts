/** Sizes, quality and geometry shared by the worker and the main-thread
 * fallback in photoStorage.ts. Kept in their own module so the two paths
 * can't drift into producing different photos, and so the worker can import
 * them without pulling in anything that touches `document`. */

/** Photos are downscaled in the browser before upload: it keeps the server
 * free of an image library, and saves a lot of mobile data compared with
 * sending a 3-10MB original straight off the camera. */
export const MAX_DIM = 2500
export const CALIDAD = 0.9

/** The timeline draws its biggest photo about 220px wide, so 800px still
 * looks sharp on a 3x phone screen. Handing the full 2500px file to those
 * slots costs roughly 240ms to decode and 19MB of memory each — twenty of
 * them on screen is what makes scrolling stutter. */
export const MAX_DIM_MINIATURA = 800
export const CALIDAD_MINIATURA = 0.82

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
