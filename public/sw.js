// Deliberately minimal: this worker exists only to catch photos shared into
// the app from Android's share sheet. It caches nothing else — an app-shell
// cache combined with auto-deploy is the classic way to leave a stale bundle
// pinned on someone's phone.
//
// Android POSTs the shared files as multipart/form-data to /compartir. The
// server can't answer that (Caddy only serves static files there), so the
// worker takes the request, stashes the files, and redirects to the app,
// which picks them up on load.

const CACHE = 'duette-compartido'
const INDICE = '/__compartido/indice'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

/** Apps that share a picture send a file. Apps that share a *page* — the
 * Pinterest app is the one that matters here — send a link instead, and
 * whether it lands in `enlace` or gets appended to `texto` depends on the
 * Android version, so take the first thing that looks like a URL. */
function primerEnlace(...campos) {
  for (const campo of campos) {
    const m = /https?:\/\/\S+/.exec(typeof campo === 'string' ? campo : '')
    if (m) return m[0]
  }
  return null
}

async function guardarCompartido(request) {
  const form = await request.formData()
  const fotos = form.getAll('fotos').filter((f) => f && typeof f === 'object' && f.size > 0)
  const enlace = primerEnlace(form.get('enlace'), form.get('texto'))
  const titulo = typeof form.get('titulo') === 'string' ? form.get('titulo') : ''

  const cache = await caches.open(CACHE)
  // Drop anything left from an earlier share that was never consumed, so a
  // stale batch can't ride along with this one.
  for (const key of await cache.keys()) await cache.delete(key)

  await Promise.all(
    fotos.map((foto, i) =>
      cache.put(
        `/__compartido/${i}`,
        new Response(foto, { headers: { 'Content-Type': foto.type || 'image/jpeg' } }),
      ),
    ),
  )
  await cache.put(
    INDICE,
    new Response(
      JSON.stringify({ cantidad: fotos.length, nombres: fotos.map((f) => f.name ?? ''), enlace, titulo }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  )
}

// ---------------------------------------------------------------- cifrado
//
// Encrypted photos are decrypted here rather than in the components, and that
// choice is what keeps the change small: photoUrl() is the only place in the
// app that builds a photo URL, so intercepting those requests means every
// <img src={photoUrl(id)}> keeps working untouched.
//
// The key only ever arrives by postMessage from a page. It is never persisted
// here — a worker is not a place to keep a secret, and this one is shared
// across every tab of the origin.

let llave = null

self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'llave') llave = event.data.llave
  if (event.data?.tipo === 'olvidar-llave') llave = null
})

/** The browser kills service workers whenever it feels like it — iOS most of
 * all, which is where most of these users are — and the key dies with it. So
 * when it's missing, ask the pages: any of them that is unlocked will answer
 * with a postMessage, and the request that triggered this waits for it.
 *
 * If nobody answers, the photo genuinely can't be shown right now, and the
 * honest outcome is a failed image rather than a hang. */
async function pedirLlaveALasPaginas() {
  const clientes = await self.clients.matchAll({ includeUncontrolled: true })
  if (clientes.length === 0) return null
  for (const cliente of clientes) cliente.postMessage({ tipo: 'necesito-llave' })
  // Poll rather than await a reply channel: the answer lands in `llave` via
  // the message handler above, and this only has to notice that it did.
  for (let espera = 0; espera < 30; espera++) {
    if (llave) return llave
    await new Promise((r) => setTimeout(r, 50))
  }
  return llave
}

const LARGO_IV = 12
const LARGO_ID = 16
const VERSION_ARCHIVO = 2

/** Same HKDF as `llaveDeArchivo` in src/lib/cripto.ts, and the info bytes have
 * to match exactly — they are part of the key, so a difference of one
 * character shows up as photos that never open. A test extracts these two
 * functions from this very file and round-trips them against the app's, so a
 * change to one side fails there rather than on someone's phone. */
async function llaveDeArchivo(llaveBytes, id) {
  const prefijo = new TextEncoder().encode('pictogether/archivo/')
  const info = new Uint8Array(prefijo.length + id.length)
  info.set(prefijo)
  info.set(id, prefijo.length)
  const base = await crypto.subtle.importKey('raw', llaveBytes, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

/** `[versión:2][id:16][iv:12][cifrado+tag]`. The derivation id travels inside
 * the envelope, which is what lets this decrypt a photo without knowing
 * anything about the row it came from — the id the server assigns changes
 * between staging and the final table, so it could never have been the basis
 * for the key. */
async function descifrarSobre(sobre, llaveBytes) {
  if (sobre.byteLength <= 1 + LARGO_ID + LARGO_IV) throw new Error('sobre incompleto')
  const bytes = new Uint8Array(sobre)
  if (bytes[0] !== VERSION_ARCHIVO) throw new Error('versión de cifrado desconocida')
  const clave = await llaveDeArchivo(llaveBytes, bytes.subarray(1, 1 + LARGO_ID))
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(1 + LARGO_ID, 1 + LARGO_ID + LARGO_IV) },
    clave,
    bytes.subarray(1 + LARGO_ID + LARGO_IV),
  )
}

async function descifrarFoto(request) {
  const respuesta = await fetch(request)
  // The server says which rows are ciphertext; a couple mid-migration has
  // both kinds behind the same URL shape, so this is asked per photo.
  if (!respuesta.ok || respuesta.headers.get('X-Cifrado') !== '1') return respuesta

  const bytes = llave ?? (await pedirLlaveALasPaginas())
  if (!bytes) return new Response('', { status: 503, statusText: 'Sin llave' })

  const sobre = await respuesta.arrayBuffer()
  const plano = await descifrarSobre(sobre, bytes)
  return new Response(plano, {
    headers: {
      'Content-Type': 'image/webp',
      // Not cached by the browser as a decrypted response: the plaintext of a
      // photo has no business sitting in the HTTP cache. The ciphertext one
      // behind it is still cached for a year, so this costs no network.
      'Cache-Control': 'no-store',
    },
  })
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Full size and ?tamano=min are two separately encrypted objects behind one
  // URL, and each carries its own derivation id — so nothing here has to tell
  // them apart.
  if (event.request.method === 'GET' && url.pathname.startsWith('/api/photos/')) {
    event.respondWith(descifrarFoto(event.request))
    return
  }

  if (event.request.method !== 'POST' || url.pathname !== '/compartir') return

  event.respondWith(
    (async () => {
      try {
        await guardarCompartido(event.request)
      } catch {
        // Land in the app anyway rather than on an error page; it will just
        // find nothing pending.
      }
      // 303 so the browser follows with a GET instead of re-posting.
      return Response.redirect('/?compartido=1', 303)
    })(),
  )
})
