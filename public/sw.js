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

async function guardarCompartido(request) {
  const form = await request.formData()
  const fotos = form.getAll('fotos').filter((f) => f && typeof f === 'object' && f.size > 0)

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
    new Response(JSON.stringify({ cantidad: fotos.length, nombres: fotos.map((f) => f.name ?? '') }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
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
