/** Turns a camera file into the two WebP copies the app stores. The work
 * runs in photoWorker.ts when the browser allows it, so picking a dozen
 * photos doesn't freeze the sheet; the main-thread path below is the
 * fallback for anything without OffscreenCanvas. */

import {
  medidas,
  OPCIONES_BITMAP,
  PRESET_RECUERDO,
  type FotoProcesada,
  type Preset,
} from './photoResize'
import type { PedidoWorker, RespuestaWorker } from './photoWorker'

export type { FotoProcesada, Preset }
export { PRESET_RECUERDO, PRESET_REFERENCIA } from './photoResize'

/** Two at a time: one is slower than the phone can go, and a dozen 2500px
 * bitmaps decoded at once is enough to exhaust memory on a phone. */
const MAX_WORKERS = 2

interface Tarea {
  file: File
  preset: Preset
  resolve: (foto: FotoProcesada) => void
  reject: (e: Error) => void
}

const cola: Tarea[] = []
const libres: Worker[] = []
const ocupados = new Map<Worker, Tarea>()
let creados = 0
/** Flips to false the first time the worker path fails, so every later photo
 * goes straight to the main thread instead of retrying a broken worker. */
let soportado = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'

function nuevoWorker(): Worker {
  const worker = new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<RespuestaWorker>) => {
    const tarea = ocupados.get(worker)
    if (!tarea) return
    ocupados.delete(worker)
    libres.push(worker)
    if ('foto' in e.data) tarea.resolve(e.data.foto)
    else tarea.reject(new Error(e.data.error))
    despachar()
  }
  // A worker that dies takes its photo with it. Failing the one task lets
  // fileToWebpBlob retry it on the main thread; the worker itself is not
  // reused, and `soportado` stops us from spawning more.
  worker.onerror = () => {
    soportado = false
    const tarea = ocupados.get(worker)
    ocupados.delete(worker)
    creados--
    worker.terminate()
    tarea?.reject(new Error('El worker de fotos falló'))
    despachar()
  }
  return worker
}

function despachar() {
  while (cola.length > 0) {
    // Once the worker path is off, queued photos are better off failing now
    // and taking the main-thread fallback than waiting on a worker that
    // isn't coming back.
    if (!soportado) {
      cola.shift()!.reject(new Error('El worker de fotos falló'))
      continue
    }
    let worker = libres.pop()
    if (!worker) {
      if (creados >= MAX_WORKERS) return
      creados++
      worker = nuevoWorker()
    }
    const tarea = cola.shift()!
    ocupados.set(worker, tarea)
    worker.postMessage({ file: tarea.file, preset: tarea.preset } satisfies PedidoWorker)
  }
}

function enWorker(file: File, preset: Preset): Promise<FotoProcesada> {
  return new Promise((resolve, reject) => {
    cola.push({ file, preset, resolve, reject })
    despachar()
  })
}

async function escalar(bitmap: ImageBitmap, maxDim: number, calidad: number): Promise<Blob> {
  const { w, h } = medidas(bitmap.width, bitmap.height, maxDim)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', calidad))
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return blob
}

/** Both sizes come off one decode of the original, which is the expensive
 * part — decoding a 12MP camera file twice would double the wait. */
async function enHiloPrincipal(file: File, preset: Preset): Promise<FotoProcesada> {
  const bitmap = await createImageBitmap(file, OPCIONES_BITMAP)
  try {
    return {
      completa: await escalar(bitmap, preset.maxDim, preset.calidad),
      miniatura: await escalar(bitmap, preset.maxDimMin, preset.calidadMin),
    }
  } finally {
    bitmap.close?.()
  }
}

export async function fileToWebpBlob(file: File, preset: Preset = PRESET_RECUERDO): Promise<FotoProcesada> {
  if (soportado) {
    try {
      return await enWorker(file, preset)
    } catch {
      // Whatever went wrong — no WebP encoder, a module that wouldn't load —
      // the photo is worth more than the thread it was processed on.
    }
  }
  return enHiloPrincipal(file, preset)
}

/** URL the app uses to display a stored photo. Requires the session cookie,
 * which the API client sets on load. `miniatura` is what the timeline grid
 * should ask for; the lightbox is the only place that needs full size. */
export function photoUrl(id: string, tamano: 'completa' | 'miniatura' = 'completa'): string {
  return tamano === 'miniatura' ? `/api/photos/${id}?tamano=min` : `/api/photos/${id}`
}
