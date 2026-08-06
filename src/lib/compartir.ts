/** Photos handed to the app from Android's share sheet. The service worker
 * catches the POST and leaves the files in a cache; the app collects them
 * on load. See `public/sw.js`. */

const CACHE = 'duette-compartido'
const INDICE = '/__compartido/indice'

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  // After load, so registration never competes with the first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sharing just won't be offered; everything else works as before.
    })
  })
}

/** Anything waiting from a share, or an empty array. Reads the cache rather
 * than trusting the `?compartido=1` marker, so photos still arrive if the
 * app had to route through sign-in first and lost the query string. */
export async function recogerFotosCompartidas(): Promise<File[]> {
  if (!('caches' in window)) return []
  try {
    const cache = await caches.open(CACHE)
    const indice = await cache.match(INDICE)
    if (!indice) return []
    const { cantidad, nombres } = (await indice.json()) as { cantidad: number; nombres: string[] }

    const fotos: File[] = []
    for (let i = 0; i < cantidad; i++) {
      const res = await cache.match(`/__compartido/${i}`)
      if (!res) continue
      const blob = await res.blob()
      fotos.push(new File([blob], nombres[i] || `compartida-${i}.jpg`, { type: blob.type }))
    }
    return fotos
  } catch {
    return []
  }
}

/** Called once the photos are in the user's hands, so a reload doesn't
 * offer the same batch again. */
export async function limpiarFotosCompartidas() {
  if (!('caches' in window)) return
  try {
    await caches.delete(CACHE)
  } catch {
    // Nothing to do; the next share overwrites the batch anyway.
  }
  if (new URLSearchParams(window.location.search).has('compartido')) {
    window.history.replaceState({}, '', window.location.pathname)
  }
}
