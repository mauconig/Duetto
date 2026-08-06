# Subida de fotos: estado del trabajo

Dos rondas de cambios sobre el mismo problema — "subir fotos es lento, y pasando ~7 da error
interno". Todo está implementado, verificado y desplegado.

**Lo único pendiente son las dos pruebas que necesitan un teléfono de verdad**, al final de la
sección de verificación. El resto de este archivo es el registro de cómo quedó.

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

**En el navegador**, con Playwright contra la app en dev (sesión de Clerk por sign-in token
del Backend API, para saltear la protección anti-bot). 12/12:

| Qué | Resultado |
|---|---|
| 30 fotos elegidas de una | 30 `POST /api/photos`, la primera a los **483ms** de elegirlas |
| ¿terminan antes de Guardar? | **30/30**, en 4,6s |
| `POST /api/entries` | 1 request, `application/json`, **1497 bytes** — sin binario |
| de Guardar a recuerdo hecho | **0,1s** |
| el recuerdo guardado | 30 fotos, en el orden elegido |
| corte de red: 5 pasan, 5 se cortan | avisa "5 fotos no subieron" |
| al guardar | reintenta **5**, no 10; sin archivos duplicados |
| sheet abandonado | ningún recuerdo nuevo; las 3 fotos quedan en staging |
| editar sumando 3 fotos | 8 → 11, las viejas intactas |
| integridad | ninguna foto sin archivo, todas con miniatura |
| errores de consola | ninguno |

**Pendiente todavía:**

1. Compartir fotos desde Android: necesita un teléfono, no se puede automatizar acá.
2. Con 30 fotos, ver si la grilla del sheet tironea en un celular real. Previsualiza los
   **archivos originales**, no las miniaturas; si se nota, el arreglo es usar la miniatura ya
   generada como preview.

---

## Estado del deploy — cerrado

Todo lo de esta sección ya se resolvió. Se deja el detalle porque describe cómo está armado
el VPS, no porque quede trabajo.

### Lo que quedó hecho en el VPS

No hay que repetirlo:

| | |
|---|---|
| Ruta del server | `/opt/duette-api` (código; solo `src/`, `package.json`, `package-lock.json`, `node_modules`) |
| Datos | `/var/lib/duette-api` — **fuera** del deploy, el `rsync --delete` no los toca |
| Secretos | `/etc/duette-api.env` — también fuera |
| Unidad systemd | `duette-api`, usuario `duette-api`, `ProtectSystem=strict` |
| Usuario del deploy | `duette-deploy` |
| Permisos | `chown -R duette-deploy:duette-api /opt/duette-api` + `chmod -R u=rwX,g=rX,o=` — **hecho y verificado** |
| Sudo | `/etc/sudoers.d/duette-deploy` permite solo `systemctl restart duette-api` — **hecho, `visudo -c` OK** |
| Variables de GitHub | `DUETTE_SERVER_PATH=/opt/duette-api`, `DUETTE_SERVER_UNIT=duette-api` — estaban cargadas en **Secrets** por error, ya movidas a **Variables** |

Se accede al VPS por el host `vps` del `~/.ssh/config` (hay que replicarlo en la laptop).

### El step del API sí corrió

Se comprueba en el VPS contando conexiones: un deploy completo abre tres sesiones SSH de
`duette-deploy` (rsync del frontend, rsync del server, y el `npm ci` + restart); un run viejo,
de un commit anterior al step, abre una sola.

```
journalctl -u ssh --since "-6 hours" | grep "Accepted publickey for duette-deploy"
```

Dio tres conexiones a las 01:22 (`7bf3cc9`) y tres a las 01:29 (`f481962`). Los archivos de
`/opt/duette-api/src/` quedaron con dueño `duette-deploy` y fecha 01:29: los puso el pipeline.

### Los runs encolados se drenaron

La cola está vacía; los 20 runs quedaron en `completed/success`. El último en pisar el
frontend fue uno viejo a las 01:31, que dejó `index-CLDwyMvp.js` — el cliente anterior — sobre
un server que ya era nuevo. Esa combinación no rompe nada, porque el server **mantiene viva la
ruta vieja de multipart** (`nuevo:<n>`). La única rota es *cliente nuevo + server viejo*, y con
el server ya actualizado no puede volver a darse.

Se resolvió con un push, que reconstruyó el frontend con la cola ya vacía.

### El `if:` del step del API

Sacado. Estaba condicionado a `vars.DUETTE_SERVER_PATH` y `DUETTE_SERVER_UNIT`, que ya
existen. Con la condición puesta, una variable renombrada saltea el deploy del server en
silencio y el run igual queda verde — que es exactamente cómo producción terminó sirviendo un
cliente que el server no entendía. Sin ella, falla fuerte.

### El tope de fotos

`7bf3cc9` lo puso en 32 como marcador para comprobar el deploy de punta a punta. Apareció en
el VPS, así que el pipeline quedó confirmado, y volvió a **30**.
