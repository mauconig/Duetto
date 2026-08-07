# Cerrado: badge "Ver en Pinterest"

Anotado el 7/8/2026, resuelto el 8/8/2026. El plan de la mudanza a R2 está
cerrado y vive en el historial de git: `git show 0b64cc7^:plan.md` si hace
falta. Lo que quedó abierto de ahí está resumido al final de este archivo.

## Qué quedó andando

Cualquier foto guardada en el Moodboard que haya venido de un pin de
Pinterest —foto o video, ya no solo video— muestra en la vista expandida un
botón rojo **"Ver en Pinterest"** con el logo, en la misma fila que
Archivar/Borrar, que lleva al pin original. En videos es además el único
lugar donde el video se reproduce, porque la app sólo guarda el fotograma de
portada.

## El bug real no era el que parecía

La sospecha original (7/8/2026) fue que la detección de video fallaba: tres
pines de video guardados, las tres veces `es_video = 0` y `url_origen = NULL`.
Se armó toda una investigación —`esPinDeVideo()`, ruta `/api/enlace/info`,
migración de columnas— asumiendo que el problema era **no reconocer** el pin.

El bug real apareció al revisar el pedido de ampliar esto a fotos (8/8/2026):
`onInspiracion` en `App.tsx` sólo armaba el objeto que se manda a guardar
cuando `enlaceEsVideo` era `true`:

```js
const origenVideo = enlaceEsVideo && enlaceOrigen ? { ... } : undefined
```

O sea que **el link ya se resolvía y guardaba en memoria correctamente para
cualquier pin** — el dato estaba ahí — pero se lo descartaba en el momento de
guardar si no era video. Para una foto pin esto significaba que nunca llegaba
a la base. Se sacó la condición: ahora `origenPinterest` se arma con
cualquier `enlaceOrigen` presente, sea video o no.

**Lo que sigue sin explicación** es por qué los tres pines de video de
prueba del 7/8 dieron `es_video = 0` incluso con la detección funcionando —
la hipótesis viva era que Pinterest los compartía como archivo sin ningún
link (ver hipótesis abajo). No se confirmó ni se descartó porque no se volvió
a probar con un pin de video real después del arreglo del 8/8. Si vuelve a
fallar específicamente con un video (no con una foto), es ahí donde mirar.

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
- **Datos viejos.** Los tres guardados son posteriores al deploy correspondiente
  (7 min, 3 min y 3 min después).

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
   en Android. Más barato de descartar que la 1.

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
- `src/App.tsx` — resuelve el enlace y arma `origenPinterest` al guardar
- `server/src/index.ts` — `esPinDeVideo`, `/api/enlace/info`, `/api/enlace/imagen`
- `src/components/TimelineLightbox.tsx` — pinta el botón, en `lightbox-acciones`

---

# Pendiente: volver a tener artículos

Anotado el 7/8/2026, sin decidir. La pregunta que lo abrió fue si es legal
mostrar artículos de otros lados, pero el problema real resultó ser otro.

## Se intentó con RSS y se revirtió (8/8/2026)

Se construyó y desplegó un curador de feeds — `server/src/noticias.ts`, tabla
`articulos`, tarjeta en Inicio — y se revirtió el mismo día. **El motivo no fue
técnico: funcionaba.** Fue que la tarjeta manda a leer al sitio del medio, y
lo que se quería era leer adentro de la app. Está en
`git show a2d4235` si algo de eso sirve.

**Lo que ese intento dejó probado, para no repetirlo:**

- **Leer el artículo dentro de la app es exactamente lo que no se puede.**
  Meter el cuerpo en nuestra UI —copiándolo o con "modo lectura"— es
  redistribución sin licencia, que es la línea del principio de esta sección.
  El RSS entregue o no el texto completo no cambia nada.
- **El iframe tampoco resuelve.** Se midieron las cabeceras: La Mente es
  Maravillosa y Siquia se dejan embeber, Psicología y Mente manda
  `X-Frame-Options: DENY`. O sea que ya fallaría en una de tres, y las otras
  dos serían su propia web con banners de cookies dentro de un marco chico:
  un navegador peor, no una tarjeta.
- **Los diarios generales no sirven como fuente.** El País y BBC Mundo
  enganchaban las palabras clave en una nota sobre la casa de *una pareja
  francesa* y en otra sobre una marca de ropa.
- **Los diarios paraguayos corren sobre Arc**: el feed vive en
  `/arc/outboundfeeds/rss/?outputType=xml`, no en `/rss` ni `/feed`. ABC Color
  anda pero no trae descripción, sólo titulares. Última Hora no expone RSS.
- **Google News RSS acepta país (`gl=PY`) pero no sirve**: la `description` es
  un `<a>` con el mismo titular, el link es un redirect opaco de Google, y la
  consulta "qué hacer fin de semana Asunción" devolvió *Sortir à Paris*.
- **Feeds vivos y en tema**, si alguna vez se retoma con links hacia afuera:
  `lamenteesmaravillosa.com/category/relaciones/feed/` (10 notas, buenas, se
  actualiza a los saltos), `siquia.com/feed/` y `psicologiaymente.com/feed`
  (frescos, generales, hay que filtrarlos). **Bekia Pareja no**: es granja de
  contenido, de 13 notas servían 3.
- **La geolocalización no era el problema que parecía.** Un item de RSS no
  tiene ubicación; lo local sale de elegir fuentes locales y de filtrar por
  nombres de ciudad. Pedir GPS obliga a un servicio externo de geocodificación
  inversa para terminar con un string que se puede preguntar una vez.

**Conclusión:** artículos que se lean dentro de la app tienen que ser
nuestros. Eso es la opción 1 de acá abajo, y ahora es la única que cumple el
requisito.

## Lo legal, que es la parte fácil

Aplica la [Ley N° 1328/98](https://www.bacn.gov.py/leyes-paraguayas/908/ley-n-1328-derecho-de-autor-y-derechos-conexos)
de Derecho de Autor y Derechos Conexos, que aplica DINAPI. Nada de esto es
asesoramiento legal, pero la línea es nítida:

- **No** copiar artículos ajenos y mostrarlos completos adentro de la app. Es
  redistribución sin licencia — el mismo razonamiento que ya está escrito en
  `1ba8615` para las fotos de Pinterest, y vale igual para texto. Paraguay
  firmó Berna, así que un artículo de un medio español o argentino está
  protegido acá igual que uno local.
- **Dos cosas que parecen permiso y no lo son:** un RSS que entrega el texto
  completo no es una licencia, y las APIs de noticias casi siempre permiten
  titular + copete + link y prohíben el cuerpo. Leer los términos, no asumir.
- **Sí** se puede: titular, resumen escrito por nosotros y link al original;
  contenido con licencia Creative Commons con atribución (`BY-SA` obliga a
  licenciar igual, `NC` prohíbe uso comercial); dominio público; y cualquier
  cosa escrita por nosotros.

Los cuatro artículos que había eran originales. Nunca hubo un problema de
licencias y no tiene por qué haberlo.

## El problema real

Los artículos no se sacaron por lo legal. La razón está en `1ba8615`:

> four articles hardcoded in data.ts with no way to add more — read in a
> week, then furniture forever.

Eso no lo arregla ninguna fuente. Si vuelven como lista fija, en una semana
son muebles otra vez. **De dónde salen los nuevos y quién los pone es la
decisión que va antes de escribir una línea de código.**

Tres caminos, en el orden en que conviene evaluarlos:

1. **Un pozo grande con rotación diaria.** `pickDaily` ya está andando en tres
   lugares (recuerdo, idea e inspiración del día). Con ~30 artículos cortos es
   un mes sin repetir y la sección cambia sola. Escritos a mano, o generados
   con un prompt que fije el tono de los cuatro viejos —están en
   `git show 1ba8615^:src/data.ts`— y revisados antes de publicar. El costo
   real es la revisión: si no se va a revisar, no vale la pena hacerlo.
2. **Cargables desde la app**, como las ideas de la ruleta: tabla, endpoints y
   los suben ellos. Resuelve el problema de raíz y es el más caro.
3. **Agregador con link afuera.** Legal si es titular + resumen propio + link,
   pero manda a la gente fuera de la app y lo que circula en español sobre
   parejas es mayormente SEO.

## Y una de diseño

Inicio ya tiene el contador, el hito, el botón de la ruleta, dos tarjetas y el
recuerdo del día. Una sección más ahí compite con lo que ya está. Si entra,
que sea una tarjeta más en la fila de dos y no un bloque nuevo.

---

# Lo que quedó abierto de la mudanza a R2

La mudanza se hizo el 7/8/2026 y cerró bien: 254 objetos, 10/10 verificados
por hash, sirviendo desde R2 desde las 17:16. El plan completo —diseño,
trampas, costos, cómo volver atrás— está en `git show 0b64cc7^:plan.md`.

Tres cosas quedaron sin hacer, a propósito o por falta de tiempo:

1. **El backup de SQLite sigue en el mismo disco que la base.** Era la otra
   mitad del problema de durabilidad y sigue abierta. Subir el snapshot
   comprimido a R2 lo cierra, y no contradice el "no mover la base a R2":
   correr SQLite desde object storage es imposible, guardar ahí una copia es
   trivial.
2. **Falta la limpieza periódica de huérfanos** — comparar bucket contra base
   y borrar lo que no tiene fila. El borrado es best-effort y ahora se loguea,
   pero en R2 un huérfano se paga todos los meses. `migrar-a-r2.ts` ya sabe
   hacer esa comparación.
3. **El respaldo continuo desde R2 se descartó** el 7/8/2026 y no se va a
   montar. `uploads/` en el VPS quedó como copia completa hasta esa fecha y
   **no hay que borrarla**; las fotos subidas desde entonces viven sólo en R2.
