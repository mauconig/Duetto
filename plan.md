# Mover las fotos a Cloudflare R2

Plan para sacar los archivos del disco del VPS y ponerlos en almacenamiento de
objetos, para que crecer no dependa de agrandar la máquina.

El handoff anterior (subida de fotos, estado del deploy) está cerrado y vive en
el historial de git: `git show f481962:plan.md` si hace falta.

---

## Primero: esto no urge, y conviene saberlo

Medido en el VPS hoy:

| | |
|---|---|
| Disco | 145 GB, **12 GB usados (8%)**, 133 GB libres |
| Fotos | **85 MB** en 254 archivos |
| Por archivo | medio 340 KB · mediana 177 KB · mayor 1.5 MB |
| Eso es | 1 pareja, 15 recuerdos, 103 fotos (más miniaturas y staging) |

A ese ritmo, ~85 MB por pareja activa, el disco aguanta del orden de **1.500
parejas** antes de ser un problema. No hay ninguna urgencia por espacio.

**Disparadores razonables para hacerlo:** que `uploads/` pase de ~40 GB, o que
quieras respaldos fuera de la máquina — que es la razón de abajo y es mejor.

## La razón que de verdad importa: durabilidad

Hoy **cada foto existe en un solo lugar**: el disco de ese VPS. Los respaldos
que hay son de la base SQLite y están en la misma máquina. Si ese disco muere,
se pierden las 103 fotos y no hay de dónde sacarlas.

R2 resuelve eso de paso. Si el plan se hace por una sola razón, que sea ésta y
no el espacio.

---

## La restricción que define todo el diseño

Quedó establecido y sigue vigente: **las fotos no pueden ser visibles sin una
sesión viva.** Una URL larga e impredecible no alcanza, y una URL prefirmada
con vencimiento tampoco: sigue siendo un enlace que funciona fuera de la app.

Consecuencia directa: **el bucket es privado y el cliente nunca habla con R2.**
`GET /api/photos/:id` se queda exactamente como está —cookie firmada, alcance
por pareja— y lo único que cambia es de dónde saca los bytes: en vez de leer
del disco, los pide a R2 y los reenvía.

Eso cuesta latencia (VPS → R2 → VPS → celular) y se mitiga con cacheo, abajo.
Lo que **no** se negocia es entregar URLs de R2 al navegador.

---

## La superficie a cambiar era chica

Todo el I/O de archivos del servidor pasaba por cuatro llamadas —dos
`writeFile`, un `unlink`, un `createReadStream`—, y hoy pasa por
`server/src/almacen.ts`. `index.ts` no importa nada de `node:fs`.

### `server/src/almacen.ts`

Una interfaz mínima con dos implementaciones, elegidas por variable de
entorno:

```ts
export interface Almacen {
  guardar(nombre: string, bytes: Buffer): Promise<void>
  leer(nombre: string): Promise<Readable | null>  // null = no existe
  borrar(nombres: string[]): Promise<void>
}
```

- `almacenDisco` — lo de antes, movido tal cual.
- `crearAlmacenR2()` — habla S3 contra R2 con `aws4fetch`.

`DUETTE_ALMACEN=disco|r2` decide cuál se usa, y se decide **una sola vez al
importar el módulo**: una credencial que falta es un servidor que no arranca,
no un 500 en la primera subida de alguien. Un valor que no sea ninguno de los
dos tampoco arranca — que `R2` en mayúsculas cayera de vuelta al disco en
silencio es exactamente el modo de falla que el deploy ya nos enseñó.

El default es `disco`, así que hasta que la variable esté en el VPS todo esto
está desplegado y sin efecto.

### Un detalle del que sirvió salir: `leer` abre antes de responder

En disco, `createReadStream` avisa de "no existe" y de "el disco falló" con el
mismo evento de error, y ese evento llega después de que las cabeceras ya
salieron. La ruta abre el archivo (o pide el objeto) primero, y recién con los
bytes en la mano escribe cabeceras. Con R2 esto deja de ser prolijidad: "la
fila existe pero el objeto no" es un caso real y tiene que terminar en un 404
limpio, no en una imagen cortada.

### La base de datos no se toca

`photos.archivo`, `photos.archivo_min`, `staged_photos.*` e `inspiraciones.*`
ya guardan **sólo el nombre del archivo**, no una ruta. Ese nombre pasa a ser
la clave del objeto en R2 sin ninguna conversión. **No hay migración de
esquema.** Vale la pena no romper esa propiedad: nada de guardar URLs completas
en la base, porque ata las filas al proveedor.

---

## El cacheo, que convenía igual

`GET /api/photos/:id` manda, desde antes de todo esto:

```
Cache-Control: private, max-age=31536000, immutable
```

Los ids no se reutilizan nunca y los bytes de una foto no cambian jamás.
`private` y no `public`, para que ninguna caché compartida guarde fotos de
alguien. Valía la pena **haya o no R2**, y con R2 pasa a ser importante: cada
vista que no cachea es una operación Clase B que se paga.

---

## Pasos

Del 1 al 4 están hechos y desplegados sin efecto, porque el default sigue
siendo `disco`. Del 5 en adelante es trabajo en el VPS y en Cloudflare.

1. ~~**Cabeceras de caché** en `GET /api/photos/:id`.~~ Ya estaban.
2. ~~**Extraer `almacen.ts`**~~ con la implementación de disco, sin cambio de
   comportamiento.
3. ~~**Implementar el almacén R2**~~ con `aws4fetch`.
4. ~~**Escribir el script de migración**~~ (`server/src/migrar-a-r2.ts`).
5. **Crear el bucket** en Cloudflare (privado, sin dominio público) y **dos**
   tokens de API, los dos alcanzados sólo a ese bucket: uno de
   lectura/escritura para la app, y uno de **sólo lectura** para el respaldo
   del paso 10. No hay versionado que activar — ver Trampas.
6. **Poner las credenciales** en `/etc/duette-api.env`, **sin** tocar
   `DUETTE_ALMACEN` todavía.
7. **Correr la migración** y leer lo que informa:
   ```
   cd "$SERVER_PATH"
   set -a; . /etc/duette-api.env; set +a
   DUETTE_ALMACEN=disco node src/migrar-a-r2.ts
   ```
   Sube lo que falte, compara el bucket contra la base y verifica diez
   archivos por hash. No borra nada y correrlo dos veces no hace nada la
   segunda.
8. **`DUETTE_ALMACEN=r2`** en `/etc/duette-api.env` y reiniciar. Los archivos
   locales **se quedan donde están**.
9. **Usar la app un tiempo.** Subir, ver, borrar, salir de una pareja.
10. **No borrar `uploads/`.** A 85 MB con 133 GB libres, borrarla no compra
    nada y es la única copia que no vive en R2.

**Hecho el 7/8/2026.** La migración cerró limpia —254 nombres, 254 archivos,
254 objetos, 10/10 verificados por hash, cero huérfanos— y el servidor sirve
desde R2 desde las 17:16. Quedaron probadas contra el bucket real las cuatro
operaciones, incluida `DeleteObjects`, que la migración no ejercitaba. Copia
del env previo en `/etc/duette-api.env.bak-2026-08-07-1713`.

Latencia medida desde el VPS: 101 ms una miniatura, 488 ms una foto completa
con el handshake incluido. La grilla pide miniaturas, así que el número que
importa es el primero.

### El respaldo continuo: decidido que no

La idea era un cron que bajara de R2 al disco con un token de sólo lectura,
para tener una copia que las credenciales de la app no pudieran borrar. Se
descartó el 7/8/2026: no se va a montar.

Lo que eso deja en pie y lo que no, para que la decisión se pueda revisar con
la información y no de memoria:

- **R2 cubre el hardware.** Los objetos están replicados; el disco que se
  muere dejó de ser el riesgo, que era la razón original de todo esto.
- **Lo que queda descubierto es el borrado por error** — un bug en la app,
  un script corrido de más. R2 no versiona y los Bucket Locks están
  descartados por lo de abajo, así que ahí no hay red.
- **`uploads/` en el VPS ya es una copia completa hasta hoy**, y sale gratis:
  alcanza con no borrarla. Cubre las 254 fotos que existían al migrar y se
  congela ahí. Las que se suban desde ahora viven sólo en R2.

Si alguna vez se quiere retomar, era `rclone copy` —nunca `sync`, que
propagaría un borrado accidental de R2 a la copia local— con el token de sólo
lectura, en un timer al lado de `duette-backup.service`.

**El backup de SQLite sigue viviendo en el mismo disco que la base**, que era
la otra mitad del problema original y sigue abierta. Subir el snapshot
comprimido a R2 lo cerraría, y no contradice el "no mover la base a R2" de
abajo: correr SQLite desde object storage es imposible, guardar ahí una copia
es trivial.

### Cómo se habla con R2

R2 es compatible con S3, y el cliente es **`aws4fetch`** — ~10 KB, sólo firma
SigV4 y usa `fetch`. Encaja con el resto del proyecto, que evita dependencias
pesadas a propósito (`node:sqlite`, TypeScript nativo, sin paso de build).
`@aws-sdk/client-s3` funciona igual pero arrastra decenas de megas para cuatro
operaciones.

Firmar SigV4 a mano es posible pero es exactamente el tipo de código donde un
error se paga caro y en silencio. No lo hagas.

Dos cosas de la implementación que no son obvias y que conviene no "arreglar":

- **`X-Amz-Content-Sha256: UNSIGNED-PAYLOAD`.** Es lo que `aws4fetch` firma
  para S3 sobre HTTPS. La cabecera va firmada; el cuerpo no entra en la firma.
  Es lo estándar y lo que R2 espera.
- **`Content-MD5` en el borrado en lote.** S3 exige el checksum del cuerpo en
  `DeleteObjects` y R2 hace lo mismo. Sin esa cabecera es un 400.

### Credenciales

Van a `/etc/duette-api.env`, junto a `CLERK_SECRET_KEY` (root, 600):

```
R2_ACCOUNT_ID=...
R2_BUCKET=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

`DUETTE_ALMACEN=r2` es una línea aparte y va **después**, cuando la migración
haya cerrado bien. Con las credenciales puestas y la variable sin poner, el
servidor sigue leyendo del disco y el script ya puede hablar con el bucket:
ése es justamente el estado en el que conviene hacer el paso 7.

Nunca en el repo. En desarrollo no hace falta poner nada: sin
`DUETTE_ALMACEN`, la laptop escribe en `data/uploads/` y no toca el bucket
real.

### El script de migración

`server/src/migrar-a-r2.ts`. De una sola vez, idempotente, y **no borra nada**
—ni del disco ni del bucket—:

1. Lee de la base todos los nombres: `photos`, `staged_photos`,
   `inspiraciones`, columnas `archivo` y `archivo_min`.
2. Lista el bucket una vez y sube sólo lo que falta. Listar de entrada, en vez
   de un `HEAD` por archivo, ahorra cientos de operaciones.
3. Compara: los nombres de la base contra los objetos del bucket.
4. Verifica por hash **una muestra** de 10 — baja de R2 y compara sha256 con el
   archivo local. Es lo único que prueba que los bytes llegaron enteros y no
   sólo que la respuesta fue 200.
5. Informa los huérfanos en los dos sentidos: archivos en disco sin fila en la
   base, y filas cuya foto no está en disco. Hoy no debería haber ninguno; si
   aparecen, entender por qué **antes** de seguir.

Sale con código 1 si algo no cierra. Si eso pasa, no toques `DUETTE_ALMACEN`.

### Cómo volver atrás

Volver es cambiar `DUETTE_ALMACEN` a `disco` y reiniciar. Eso funciona
mientras los archivos locales estén completos, o sea hasta que empiecen a
subirse fotos nuevas que sólo viven en R2 — de ahí en más volver atrás
significa además correr el respaldo del paso 10 en sentido inverso. Es otra
razón para montar ese cron y no borrar nunca `uploads/`.

---

## Costos

Del [tarifario de R2](https://developers.cloudflare.com/r2/pricing):

| | Gratis por mes | Después |
|---|---|---|
| Almacenamiento | 10 GB | $0.015 / GB |
| Clase A (escrituras) | 1 M | $4.50 / M |
| Clase B (lecturas) | 10 M | $0.36 / M |
| Egreso | **siempre $0** | — |

A 85 MB por pareja, los 10 GB gratis dan para **~120 parejas**. Cien parejas
más son unos centavos por mes. El egreso gratis es lo que hace que esto sea
barato y no una trampa.

Cuidado con las lecturas: como el servidor hace de intermediario, **cada foto
que el navegador no tiene cacheada es una operación Clase B**. Con las
cabeceras del paso 1, 10 M por mes queda lejísimos.

---

## Trampas

**El borrado sigue siendo best-effort, pero ya no es mudo.** Que borrar falle
no puede voltear el pedido: el recuerdo que el usuario sacó se fue de la línea
de tiempo, vayan o no los bytes con él. Lo que sí cambió es que ahora se
registra en el log — el `.catch(() => {})` de antes es exactamente cómo se
acumulan huérfanos sin que nadie se entere, y en R2 un huérfano se paga todos
los meses. Queda pendiente una limpieza periódica que compare bucket contra
base; el script de migración ya sabe hacer esa comparación.

**R2 no versiona, y no hay forma de que lo haga.** Este plan decía antes que
había que habilitar versionado de objetos en el bucket. No existe:
`PutBucketVersioning`, `GetBucketVersioning` y `PutObjectLockConfiguration`
figuran como no implementadas en la [tabla de compatibilidad
S3](https://developers.cloudflare.com/r2/api/s3/api/). Lo escrito antes venía
del hábito de S3 y nadie lo había verificado.

Tampoco importa tanto como parecía, porque **acá no hay versiones que
guardar**: los objetos son inmutables por construcción. Cada archivo es un
`<uuid>.webp` random, escrito una vez y nunca sobrescrito — editar un recuerdo
genera nombres nuevos, no pisa los viejos. Nunca existe una versión anterior de
un objeto. El único riesgo real es el borrado.

**Los Bucket Locks no son la solución a ese riesgo, para esta app.** R2 sí
ofrece retención (`wrangler r2 bucket lock add`), que impide borrar o
sobrescribir por un período o indefinidamente. Descartado por dos razones y
media:

- **La app borra de verdad y seguido**: borrar un recuerdo, borrar una
  inspiración, salir de la pareja, el barrido de staging cada 24 h. Con un
  lock esas llamadas fallan. La app no se rompe —el borrado es best-effort—
  pero no se borra nada nunca y el bucket acumula basura que se paga igual.
- **Choca con la política de privacidad.** Si alguien borra la pareja
  ejerciendo el derecho de supresión, las fotos tienen que irse. Un lock de
  retención dice que no. Eso es un problema legal, y le pega justo a lo que
  `privacidad_version` y `privacidad_at` existen para respaldar.
- Y de yapa: los locks no se pueden acortar, sólo eliminar la regla entera, y
  un bucket no se puede vaciar mientras haya alguna regla configurada.

**Lo que sí protege: la segunda copia.** El riesgo no es la sobrescritura, es
que un bug borre objetos. Contra eso sirve una copia que las credenciales de la
app no puedan tocar — y ya la tenés en la máquina. Ver "El respaldo" en Pasos.

**El borrado en lote.** Salir de una pareja puede borrar cientos de archivos de
una. El almacén R2 usa `DeleteObjects` en lotes de 1000 en vez de mil pedidos
sueltos; en disco no hacía diferencia, en R2 son mil operaciones Clase A.

**El pipeline no toca las fotos.** El deploy hace `rsync --delete` sobre
`server/`, y `uploads/` vive en `/var/lib/duette-api/`, fuera de ahí. Sigue
siendo cierto después de este cambio; no lo rompas moviendo el directorio
adentro del deploy.

**Las miniaturas son el camino caliente.** La grilla pide `?tamano=min` para
todo lo que se ve. Si la latencia de R2 molesta en el celular, la respuesta no
es volver al disco: es cachear las miniaturas localmente, que son chicas.

---

## Lo que no hay que hacer

- **No** hacer el bucket público ni conectarle un dominio.
- **No** entregar URLs prefirmadas al navegador. Se evaluó y se descartó: es un
  enlace que funciona sin sesión, y eso es justamente lo que no queremos.
- **No** mover la base SQLite a R2. Es un archivo con escrituras concurrentes;
  el almacenamiento de objetos no sirve para eso. Subir un *snapshot* sí, y
  conviene.
- **No** guardar URLs completas en las columnas `archivo`. El nombre pelado es
  lo que hace que cambiar de proveedor sea barato.
- **No** borrar `uploads/` — ni el día que se cambia el flag ni después. Es la
  segunda copia, y es lo único que reemplaza al versionado que R2 no tiene.
- **No** poner un Bucket Lock sobre el bucket de la app. Rompe los borrados
  legítimos y el derecho de supresión, y después no se puede acortar.
- **No** hacer el respaldo con `rclone sync`. `copy`, para que un borrado en
  R2 no se propague a la copia local.
