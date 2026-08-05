const MAX_DIM = 1000
export const IMG_STORAGE_PREFIX = 'duette-img:'

export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/webp', 0.85)
  } finally {
    bitmap.close?.()
  }
}

export function storePhoto(id: string, dataUrl: string) {
  localStorage.setItem(IMG_STORAGE_PREFIX + id, dataUrl)
}

export function loadPhoto(id: string): string | null {
  return localStorage.getItem(IMG_STORAGE_PREFIX + id)
}
