/** Photos are downscaled in the browser before upload: it keeps the server
 * free of an image library, and saves a lot of mobile data compared with
 * sending a 3-10MB original straight off the camera. */
const MAX_DIM = 2500
const CALIDAD = 0.9

/** The timeline draws its biggest photo about 220px wide, so 800px still
 * looks sharp on a 3x phone screen. Handing the full 2500px file to those
 * slots costs roughly 240ms to decode and 19MB of memory each — twenty of
 * them on screen is what makes scrolling stutter. */
const MAX_DIM_MINIATURA = 800
const CALIDAD_MINIATURA = 0.82

async function escalar(bitmap: ImageBitmap, maxDim: number, calidad: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', calidad))
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return blob
}

export interface FotoProcesada {
  completa: Blob
  miniatura: Blob
}

/** Both sizes come off one decode of the original, which is the expensive
 * part — decoding a 12MP camera file twice would double the wait. */
export async function fileToWebpBlob(file: File): Promise<FotoProcesada> {
  const bitmap = await createImageBitmap(file)
  try {
    return {
      completa: await escalar(bitmap, MAX_DIM, CALIDAD),
      miniatura: await escalar(bitmap, MAX_DIM_MINIATURA, CALIDAD_MINIATURA),
    }
  } finally {
    bitmap.close?.()
  }
}

/** URL the app uses to display a stored photo. Requires the session cookie,
 * which the API client sets on load. `miniatura` is what the timeline grid
 * should ask for; the lightbox is the only place that needs full size. */
export function photoUrl(id: string, tamano: 'completa' | 'miniatura' = 'completa'): string {
  return tamano === 'miniatura' ? `/api/photos/${id}?tamano=min` : `/api/photos/${id}`
}
