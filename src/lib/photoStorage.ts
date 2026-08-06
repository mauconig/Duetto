/** Photos are downscaled in the browser before upload: it keeps the server
 * free of an image library, and saves a lot of mobile data compared with
 * sending a 3-10MB original straight off the camera. */
const MAX_DIM = 2500
const CALIDAD = 0.9

export async function fileToWebpBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', CALIDAD))
    if (!blob) throw new Error('No se pudo procesar la imagen')
    return blob
  } finally {
    bitmap.close?.()
  }
}

/** URL the app uses to display a stored photo. Requires the session cookie,
 * which the API client sets on load. */
export function photoUrl(id: string): string {
  return `/api/photos/${id}`
}
