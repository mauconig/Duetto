# Subida de fotos: estado del trabajo

Dos rondas de cambios sobre el mismo problema — "subir fotos es lento, y pasando ~7 da error
interno". Todo está implementado y verificado **localmente**; nada commiteado salvo este
archivo. Lo que falta para poder mergear está al final.

---

## Ronda 1 — el error y la lentitud

### El "Error interno" con 7+ fotos

No era un límite real sino un bug de conteo. [server/src/index.ts](server/src/index.ts) ponía
`files: MAX_FOTOS` en multer, pero ese límite de busboy cuenta **partes de archivo de toda la
request**, y el cliente mandaba dos por foto (completa + miniatura). El techo real eran 6
fotos: con 7 son 14 partes, busboy cortaba en la 13ª, multer tiraba `LIMIT_FILE_COUNT` y el
handler global lo convertía en `500 {"error":"Error interno"}`.

- `files: MAX_FOTOS * 2`.
- Middleware que traduce los errores de multer a 400 con mensaje en español, en vez del 500
  genérico.
- `archivosDe` rechaza una request cuyas miniaturas no emparejan con las fotos, en lugar de
  guardar fotos sin miniatura en silencio.

### La lentitud

La compresión (~0,5s por foto) arrancaba recién al tocar Guardar y corría en el hilo
principal: con 12 fotos eran ~6-12s de UI congelada antes de que empezara la subida.

- Nuevo [src/lib/photoWorker.ts](src/lib/photoWorker.ts): decodifica y encodea con
  `OffscreenCanvas` fuera del hilo principal.
- [src/lib/photoStorage.ts](src/lib/photoStorage.ts): pool de 2 workers con cola, y fallback
  al `<canvas>` del DOM si el navegador no soporta `OffscreenCanvas` o si un worker muere.
- [src/lib/photoResize.ts](src/lib/photoResize.ts): medidas y calidad compartidas por los dos
  caminos, para que no puedan divergir. La calidad no cambió (2500px/0.9 y 800px/0.82).
- `imageOrientation: 'from-image'` en el decode: reencodear por canvas descarta el tag EXIF de
  orientación, así que las fotos verticales podían quedar acostadas.

### El tope

Subido de 12 a **30 fotos** por recuerdo, en las dos constantes. El tope por archivo bajó de
15MB a 8MB: multer bufferea la request entera en RAM, así que el techo de una subida es
`tope × MAX_FOTOS × 2`, y con 30 fotos a 15MB serían 900MB en un VPS chico.

---

## Ronda 2 — una request por foto

Con 30 fotos, la request única eran ~60 partes y ~20-25MB en un solo POST atómico: si la
conexión se cortaba en la foto 28 se perdía todo, y la subida ni siquiera empezaba hasta tocar
Guardar.

**Flujo nuevo:**

```
elegís 30 fotos
  ├── comprimir en el worker (2 a la vez)
  └── POST /api/photos por cada una (3 a la vez) → { id }
        ↑ mientras escribís la nota
tocás Guardar
  └── POST /api/entries  { fecha, nota, fondo, orden: ["staged:a1", ...] }
        sin archivos → responde al toque
```

**Server:**

- Tabla `staged_photos` en [server/src/db.ts](server/src/db.ts): fotos ya subidas que todavía
  no tienen recuerdo. `ON DELETE CASCADE` la engancha al borrado de pareja.
- `POST /api/photos` recibe una foto y su miniatura, y devuelve el id.
- `orden` acepta `staged:<id>` además del id existente y de `nuevo:<n>`. Reclamar una foto es
  un **movimiento de fila**: los bytes ya están en disco, no se copian.
- Un `staged:<id>` que no aparece (barrido, o de otra pareja) da **400**, no se ignora:
  perder una foto en silencio es peor que fallar.
- Barrido de huérfanas perezoso, en cada subida — sin `setInterval`, porque subir es la única
  forma de generarlas. TTL 24h. Salir de la pareja también se lleva su staging.
- **El camino viejo (multipart con `nuevo:<n>`) sigue vivo**, así que un cliente con el bundle
  viejo abierto sigue guardando bien.

**Cliente:**

- `subirFoto` en [src/lib/api.ts](src/lib/api.ts). Los entries pasaron a JSON: al no llevar
  archivos, `armarFormulario` desapareció.
- [src/components/EntrySheet.tsx](src/components/EntrySheet.tsx) encadena comprimir → subir
  apenas se elige cada foto, con un semáforo de 3 subidas en paralelo. Cacheado por identidad
  del `File`: reordenar, quitar o reintentar no rehace nada.
- El contador dice "Subiendo 12 de 30"; las que fallan se reintentan solas al guardar, y solo
  esas.

---

## Verificación

**Hecho:**

- Harness que corre el **código real del server** (mockeando solo `verifyToken` de Clerk):
  17/17 — staging, consumo del staging al crear, orden respetado, foto intercalada en un
  PATCH, aislamiento entre parejas, barrido de filas *y* archivos, tope por pareja.
- Harness de multer con el tope nuevo: 8/8 — 30 fotos entran, 31 se rechaza legible.
- `tsc -b && vite build` y `oxlint` sin warnings nuevos; el server arranca contra una base
  descartable.

**Pendiente — necesita las claves de Clerk, así que va del lado de Mauricio:**

1. Elegir 30 fotos y mirar la pestaña Network: 30 POST chicos a `/api/photos` que arrancan
   solos, y al guardar un POST a `/api/entries` sin cuerpo binario que responde al toque.
2. Cortar la red con la mitad subidas, reconectar y guardar: se reintentan solo las que
   fallaron.
3. Abrir el sheet, subir fotos y cerrarlo sin guardar: no aparece ningún recuerdo.
4. Editar un recuerdo existente agregando fotos: las viejas se conservan, las nuevas entran en
   la posición elegida.
5. Compartir fotos desde Android: pasan por el mismo pipeline al montarse.
6. Con 30 fotos, ver si la grilla del sheet tironea. Previsualiza los **archivos originales**,
   no las miniaturas; si se nota, el arreglo es usar la miniatura ya generada como preview.

---

## Antes de mergear: el server tiene que desplegarse

El cliente nuevo llama a `POST /api/photos`. **Si el server del VPS sigue viejo, cada guardado
falla.**

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) ahora sube también `server/`,
corre `npm ci --omit=dev` y reinicia el servicio, excluyendo `data/` — un `--delete` sin esa
exclusión se llevaría la base SQLite y todas las fotos. Pero **ese step hoy se saltea**, porque
está condicionado a dos variables que no existen todavía.

En Settings → Secrets and variables → Actions → Variables, definir:

- `DUETTE_SERVER_PATH` — la ruta del server en el VPS (ej. `/srv/duette-server`)
- `DUETTE_SERVER_UNIT` — el nombre de la unidad systemd

Y que el usuario del deploy pueda `sudo systemctl restart <unidad>` sin contraseña (el step usa
`sudo -n`, así que si pide password falla rápido en vez de colgarse).

Con eso definido, confirmar en el primer run que el step corrió de verdad antes de dar por
buena la subida.
