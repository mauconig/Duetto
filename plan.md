# Pendiente: badge "Ver en Pinterest" en pines de video

Estado al 2026-08-07, 22:05. **No funciona todavía.** Tres guardados, las tres
veces `es_video = 0` y `url_origen = NULL`.

## Qué se quiere

Al compartir un pin de video a Pictogether y guardarlo en el Moodboard:

- La miniatura ya muestra el play — lo dibuja Pinterest en la portada, la app
  no agrega ninguno (esto ya está resuelto, se sacaron los dos que agregaba).
- Al abrir la foto, un badge **"Ver en Pinterest"** que lleve al pin original,
  que es el único lugar donde el video se reproduce.
- Solo en videos. En fotos anda todo bien y no se toca.

## Verificado que SÍ funciona

| Pieza | Cómo se verificó |
|---|---|
| Detección server-side (`esPinDeVideo`) | Contra el HTML real de `pin.it/4RjoeAkAg` → `true`. Contra HTML sin el marcador → `false` |
| El marcador `data-test-id="video-snippet"` | Presente en el pin de video real; es el bloque JSON-LD `VideoObject` de Pinterest |
| Migración de la base | `es_video` y `url_origen` existen en producción (`PRAGMA table_info`) |
| Insert/select con los campos nuevos | Roundtrip contra una sqlite descartable |
| Ruta `GET /api/enlace/info` | Devuelve `esVideo: true` para el pin real; rechaza otro host, `http://` y basura |

## Descartado como causa

- **User-Agent.** Pinterest sirve el mismo HTML al `fetch` pelado de Node que a
  un teléfono. El marcador está en los dos.
- **CORS / proxy.** El API está bajo `/api/*` en el mismo host (Caddy), así que
  es same-origin y el header `X-Es-Video` no se pierde.
- **Service worker.** Solo intercepta `POST /compartir`. No toca `/api/`.
- **Datos viejos.** Los tres guardados son posteriores al deploy correspondiente.

## El dato que más informa

El `og:image` del pin de video (`i.pinimg.com/736x/86/0a/c7/860ac722...jpg`,
288x512) es **el fotograma limpio, sin ningún play dibujado**. Se descargó y se
miró.

Pero en la app se ve un play. Entonces **los bytes guardados no salieron del
`og:image`** — salieron de un archivo que mandó Pinterest, que sí trae el play
compuesto encima.

O sea: el pin de video no llega como link. Llega como archivo.

## Lo que ya se intentó (y no alcanzó)

Se asumió que llegaba como **archivo + link**, y se agregó que el handler
resuelva el link igual cuando vienen archivos:

```js
if (fotos.length > 0) {
  setCompartidas(fotos)
  if (enlace) api.infoDeEnlace(enlace).then(...)   // ← agregado
  return
}
```

Se guardó otro y siguió en `es_video = 0`.

## Hipótesis vivas

1. **Pinterest manda el archivo SIN ningún link** (ni en `url` ni en `text`).
   Si es así, `enlace` es `null`, no hay nada que resolver, y el arreglo
   anterior no puede funcionar por construcción. **Es la más probable.**
   Consecuencia incómoda: si no llega la URL del pin, no hay a dónde apuntar el
   badge, y habría que sacarla de otro lado (¿buscar la imagen en Pinterest?
   ¿pedirle al usuario que comparta el link aparte?).

2. **El teléfono seguía corriendo el bundle viejo.** Las PWA quedan residentes
   en Android. Los guardados fueron 7 y 3 minutos después de cada deploy, lo
   que no garantiza que hubiera recargado. Más barato de descartar que la 1.

## Próximo paso concreto

No seguir adivinando qué manda Pinterest: **medirlo**. Guardar en el índice del
service worker qué campos vinieron en el share (nombres de campos presentes,
si se encontró URL, cuántos archivos) y mostrarlo una vez en pantalla o
dejarlo en la respuesta de `/api/inspiraciones`. Con eso se ve el payload real
en vez de inferirlo, y se sabe si la hipótesis 1 es cierta.

Antes de eso, lo barato: **cerrar la app del todo, reabrirla y compartir un
pin de video de nuevo**. Si aparece el badge, era la hipótesis 2 y no hay nada
más que hacer.

## Archivos involucrados

- `public/sw.js` — recibe el share, guarda archivos y link en cache
- `public/manifest.webmanifest` — declara `share_target` (acepta title/text/url/files)
- `src/lib/compartir.ts` — lee lo que dejó el worker
- `src/App.tsx` — resuelve el enlace y decide `origenVideo`
- `server/src/index.ts` — `esPinDeVideo`, `/api/enlace/info`, `/api/enlace/imagen`
- `src/components/TimelineLightbox.tsx` — pinta el badge
