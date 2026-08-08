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

---

# Pendiente: cifrado de extremo a extremo

Anotado el 8/8/2026, sin decidir. La pregunta que lo abrió: garantizar que las
fotos sean privadas al punto de que **ni el admin pueda verlas**.

## Lo primero: no es un problema de proveedor

Se preguntó por alternativas a R2 y al VPS. No las hay para esto. Ni S3, ni
Backblaze, ni un NAS propio, ni P2P: en todos, quien opera el sistema ve los
bytes. Mudarse de nuevo no toca el problema.

Lo único que lo cumple es **cifrar en el dispositivo antes de subir, con una
llave que nunca llega al servidor**. Es ortogonal a dónde estén guardadas: con
esto, R2 pasa a contener ruido y la mudanza que ya se hizo sigue valiendo
igual, por durabilidad.

## La limitación que hay que decir antes que nada

Esto es una **web app**: el servidor entrega el JavaScript en cada carga. Quien
controla el servidor puede publicar código que capture la frase de acceso. La
afirmación honesta no es "100% privado" sino:

> El servidor nunca tiene la llave, y las fotos guardadas son ilegibles para el
> admin. Pero seguís confiando en que el código que se entrega siga siendo
> honesto.

Es la limitación conocida del cripto en el navegador y no tiene solución dentro
del navegador. **Una app nativa la mejora de verdad**: código firmado, revisado
y que no se reemplaza en cada carga. Si la promesa se le hace al usuario por
escrito, tiene que decir esto y no más que esto.

## El conflicto con el punto 3 de arriba

`uploads/` en el VPS es una copia **en claro** de todo lo subido hasta el
7/8/2026, y quedó marcada como "no borrar" porque es el único respaldo de esas
fotos. **Las dos cosas no pueden ser ciertas a la vez.** Si se hace E2EE hay
que elegir: o esa copia se cifra también y deja de ser un respaldo utilizable
sin la llave, o se borra y esas fotos quedan sólo en R2, o se acepta que lo
anterior al 7/8 nunca fue privado. No hay una cuarta opción, y conviene
decidirlo antes de empezar y no al final.

## Llaves

- Al crear la pareja, el dispositivo genera una **llave de pareja** aleatoria
  de 256 bits (`crypto.getRandomValues`). Nunca sale en claro.
- Quien la crea elige una **frase de acceso**, distinta de la contraseña de
  Clerk (Clerk nunca nos la da, así que no se puede derivar de ahí).
- De esa frase se deriva una llave que **envuelve** la de pareja. El servidor
  guarda `salt`, parámetros del KDF y la llave envuelta. No puede abrirla.
- KDF: **Argon2id** (19 MiB, t=2, p=1,
  [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html))
  vía WASM; o **PBKDF2-HMAC-SHA256 con 600.000 iteraciones**, que ya está en
  WebCrypto y es el mínimo que OWASP acepta.
- La pareja que entra con el código necesita la misma frase, dicha en persona.
  Es una pareja: ese es el caso fácil del intercambio de llaves.
- Dispositivo nuevo: se escribe la frase, se abre la llave, queda en memoria (y
  en IndexedDB sólo si marcan "recordar este dispositivo").

## Recuperación — la decisión incómoda

**Si se puede recuperar, el admin también puede.** No hay punto intermedio.

La salida estándar es un **código de recuperación** de alta entropía mostrado
**una sola vez**, que envuelve la misma llave. Si se pierden la frase y el
código, **las fotos se pierden para siempre**, sin excepción.

Eso va a pasarle a alguien. Tiene que estar dicho sin eufemismos en la pantalla
de creación, y conviene forzar a confirmar que lo guardaron.

## Datos

- **AES-256-GCM** por archivo, IV aleatorio de 96 bits.
- Llave por archivo con **HKDF(llaveDePareja, idDelArchivo)**: determinística,
  no guarda nada extra, y evita reusar un nonce entre archivos.
- Se cifran la foto completa **y** la miniatura.
- Se cifran los textos: `entries.nota`, `categorias.nombre`, `ideas.texto`,
  `members.nombre`.
- **Las fechas quedan en claro.** `entries.fecha` ordena la línea de tiempo y
  alimenta el "recuerdo del día". Es una fuga consciente, no un olvido.
- `url_origen` de los pines también queda en claro salvo que se cifre: revela
  qué se guardó de Pinterest.

## Lo que sigue filtrándose igual

E2EE no esconde metadatos: cuántas fotos hay, cuándo se subieron, cuánto pesan,
quién está emparejado con quién y cuándo están activos.

## Por qué el cambio es más chico de lo que parece

Verificado contra el código al 8/8/2026:

| Punto | Archivo | Qué cambia |
|---|---|---|
| Compresión | `src/lib/photoStorage.ts` → `fileToWebpBlob()` | nada; ya devuelve dos `Blob` |
| **Cifrar al subir** | después de `fileToWebpBlob`, antes de `api.ts` | se agrega ahí |
| **Descifrar al mostrar** | `public/sw.js` | intercepta `/api/photos/*` |
| Servidor | `server/src/almacen.ts` | **nada**: ya guarda bytes opacos |

La fila que hace barato todo esto es la tercera. `photoUrl()`
(`src/lib/photoStorage.ts:131`) es el **único** lugar donde se arman URLs de
fotos —lo usan `duette.ts:205`, `Inspiracion.tsx:58` y `App.tsx:458`, todos a
través de la función— y el service worker ya tiene un `fetch` listener por el
share target. Si el SW intercepta `/api/photos/*`, baja el cifrado, descifra y
devuelve una respuesta de imagen normal, **los componentes no cambian una
línea**: `<img src={photoUrl(id)}>` sigue igual en `ImageSlot`,
`PhotoGallery`, `TimelineLightbox` e `Inspiracion.tsx`.

La llave se le pasa al SW por `postMessage` y vive sólo en memoria. Como el
navegador puede matarlo, cuando no la tenga debe pedírsela a sus clientes
(`clients.matchAll()`) antes de responder; si no hay ninguno, 503 y la página
reintenta.

Y `almacen.ts` ya existe desde la mudanza a R2, así que el servidor no se toca:
guardar ruido es exactamente lo mismo que guardar WebP.

Esquema: `couples` gana `llave_envuelta`, `kdf_salt`, `kdf_params`.

## Pasos

1. `src/lib/cripto.ts`: derivar, envolver/abrir, cifrar/descifrar. Con tests de
   ida y vuelta **antes** de tocar la app.
2. Pantallas: crear frase + código de recuperación, y desbloquear en un
   dispositivo nuevo.
3. Cifrado en la subida.
4. Descifrado en el service worker, con el protocolo de pedir la llave.
5. Textos (notas, categorías, ideas, nombres).
6. Migrar lo que ya existe: bajar, cifrar y volver a subir **desde el
   dispositivo del dueño**. No se puede hacer en el servidor — ése es el punto,
   y es lo que lo diferencia de `migrar-a-r2.ts`, que sí corrió en el VPS.
7. Reescribir la política de privacidad, y decidir el punto de `uploads/`.

## Verificación

- **Ida y vuelta:** cifrar y descifrar 1000 blobs al azar sin pérdida.
- **La prueba que importa:** con la app andando, bajar un objeto del bucket y
  confirmar que es ruido — `file` no lo reconoce, no hay cabecera WebP. Y que
  `SELECT nota FROM entries` devuelva texto cifrado.
- **Dispositivo nuevo:** entrar desde otro navegador, escribir la frase, ver
  las fotos.
- **Frase equivocada:** falla al abrir, no muestra nada y **no borra nada**.
- **Código de recuperación:** con la frase olvidada, restaura.
- **El SW muerto:** matarlo desde DevTools con la app abierta y confirmar que
  las imágenes se recuperan solas.
- **Rendimiento:** que subir 30 fotos no se vuelva perceptiblemente más lento
  en un celular real. AES-GCM tiene aceleración por hardware, pero hay que
  medirlo, no suponerlo.

---

# Descartado: P2P estilo torrent

Se evaluó el 8/8/2026 como alternativa a R2 y al VPS. No va, y queda escrito
con la evidencia para no rediscutirlo.

## En la PWA — imposible, no difícil

- **`RTCPeerConnection` no existe en el scope de un service worker**
  ([Chromium 40251342](https://issues.chromium.org/issues/40251342)), y el
  navegador puede terminar el SW cuando no tiene eventos que atender. La app no
  puede sembrar con la pantalla apagada porque la API no está ahí.
- **Un peer de navegador no alcanza el enjambre normal de BitTorrent.** La
  [FAQ de WebTorrent](https://webtorrent.io/faq): *"In the browser, WebTorrent
  can only download torrents that are seeded by a WebRTC-capable torrent
  client."* Mismo protocolo, distinto transporte, y hacen falta trackers
  modificados para la señalización.

## En una app nativa — mejora, y sigue sin servir

- **iOS no permite P2P en segundo plano.** Del hilo de Apple
  [Support for P2P Connectivity and Network Requests in the Background](https://developer.apple.com/forums/thread/760431):
  *"There is no way to achieve continuous P2P networking goals with most
  networking APIs... There are exceptions, like URLSession background sessions,
  but nothing relevant to continuous P2P networking requirements."* Y esas
  sesiones transfieren **contra un servidor por HTTP**, que es justamente lo que
  el P2P quería evitar. Aparte, las apps de compartición P2P suelen ser
  rechazadas de la App Store.
- **Android lo permite a medias.** Un foreground service `dataSync` está
  [limitado a 6 horas cada 24](https://developer.android.com/develop/background-work/services/fgs/timeout);
  pasado el tope, `onTimeout()`, y si no parás, `RemoteServiceException`.
  Android 15 entra en Doze un 50% más rápido y los OEM matan procesos por su
  cuenta. Todo a cambio de una notificación permanente.
- **La aritmética de dos dispositivos.** Si cada celular está disponible el 50%
  del tiempo, hay **1 probabilidad en 4 de que las fotos no estén** al abrir la
  app. Para un álbum de recuerdos eso no es un porcentaje, es "desapareció".
- **Y sigue haciendo falta un seeder siempre encendido, que es un servidor.**
  No ahorra nada, y dos teléfonos que se pierden o se rompen son **menos**
  copias que R2.

P2P sirve para distribuir **un archivo popular a mucha gente**. Esta app
necesita lo contrario: **muchos archivos privados, para dos personas, siempre
disponibles.**

**Lo que sí valdría en una app nativa**, encima del servidor y no en su lugar:
transferencia directa entre los dos teléfonos cuando están en la misma WiFi
(MultipeerConnectivity, Wi-Fi Direct), y guardar los originales a resolución
completa en el dispositivo subiendo sólo la versión comprimida.
