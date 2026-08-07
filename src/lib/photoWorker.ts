/** Downscaling and WebP encoding, off the main thread.
 *
 * A 12MP camera photo costs roughly half a second to decode and re-encode,
 * and the sheet processes up to twelve of them. On the main thread that
 * freezes the app for the whole batch; here it doesn't, and photoStorage.ts
 * runs a couple of these at once to use more than one core.
 *
 * One message in, one message out — the caller only ever has a single photo
 * in flight per worker, so there's no need for request ids. */

import { medidas, OPCIONES_BITMAP, PRESET_RECUERDO, type FotoProcesada, type Preset } from './photoResize'

/** `lib` is DOM rather than WebWorker (see tsconfig.app.json), so the worker
 * globals need naming by hand. */
const ctx = self as unknown as {
  postMessage(mensaje: RespuestaWorker): void
  onmessage: ((e: MessageEvent<PedidoWorker>) => void) | null
}

export interface PedidoWorker {
  file: File
  /** Optional so an older message still means "a recuerdo photo". */
  preset?: Preset
}

export type RespuestaWorker = { foto: FotoProcesada } | { error: string }

async function escalar(bitmap: ImageBitmap, maxDim: number, calidad: number): Promise<Blob> {
  const { w, h } = medidas(bitmap.width, bitmap.height, maxDim)
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  return canvas.convertToBlob({ type: 'image/webp', quality: calidad })
}

ctx.onmessage = async (e) => {
  try {
    // Both sizes come off one decode of the original, which is the expensive
    // part — decoding a 12MP camera file twice would double the wait.
    const preset = e.data.preset ?? PRESET_RECUERDO
    const bitmap = await createImageBitmap(e.data.file, OPCIONES_BITMAP)
    try {
      ctx.postMessage({
        foto: {
          completa: await escalar(bitmap, preset.maxDim, preset.calidad),
          miniatura: await escalar(bitmap, preset.maxDimMin, preset.calidadMin),
        },
      })
    } finally {
      bitmap.close()
    }
  } catch (err) {
    ctx.postMessage({ error: err instanceof Error ? err.message : 'No se pudo procesar la imagen' })
  }
}
