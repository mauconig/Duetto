# Mover las fotos a Cloudflare R2

Plan para sacar los archivos del disco del VPS y ponerlos en almacenamiento de
objetos, para que crecer no dependa de agrandar la máquina.

El handoff anterior (subida de fotos, estado del deploy) está cerrado y vive en
el historial de git: `git show HEAD~1:plan.md` si hace falta.

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

## La superficie a cambiar es chica

Todo el I/O de archivos del servidor pasa por cuatro llamadas. Los números de
línea van a moverse, pero los puntos son éstos:

| Dónde | Qué hace |
|---|---|
| `server/src/index.ts:388` | `writeFile` de la foto completa |
| `server/src/index.ts:392` | `writeFile` de la miniatura |
| `server/src/index.ts:405` | `unlink` dentro de `borrarArchivos` |
| `server/src/index.ts:972` | `createReadStream` al servir la foto |

Nada más toca el disco. Por eso esto es un cambio acotado y no una refactor.

### Diseño: `server/src/almacen.ts`

Una interfaz mínima con dos implementaciones, elegidas por variable de entorno:

```ts
export interface Almacen {
  guardar(nombre: string, bytes: Buffer): Promise<void>
  leer(nombre: string): Promise<ReadableStream | null>  // null = no existe
  borrar(nombres: string[]): Promise<void>
}
```

- `almacenDisco` — lo de ahora, movido tal cual.
- `almacenR2` — habla S3 contra R2.

`DUETTE_ALMACEN=disco|r2` decide cuál se usa. Arranca en `disco`, así el
código nuevo se despliega y se prueba sin cambiar de comportamiento.

### La base de datos no se toca

`photos.archivo`, `photos.archivo_min`, `staged_photos.*` e `inspiraciones.*`
ya guardan **sólo el nombre del archivo**, no una ruta. Ese nombre pasa a ser
la clave del objeto en R2 sin ninguna conversión. **No hay migración de
esquema.** Vale la pena no romper esa propiedad: nada de guardar URLs completas
en la base, porque ata las filas al proveedor.

---

## Antes de R2: el cacheo, que conviene igual

`GET /api/photos/:id` hoy no manda ninguna cabecera de caché, así que el
navegador vuelve a pedir cada foto todo el tiempo. Los ids no se reutilizan
nunca y los bytes de una foto no cambian jamás, así que son inmutables:

```
Cache-Control: private, max-age=31536000, immutable
```

`private` y no `public`, para que ninguna caché compartida guarde fotos de
alguien. Esto vale la pena **haya o no R2**, y con R2 pasa a ser importante:
cada vista que no cachea es una operación Clase B que se paga.

---

## Pasos

1. **Cabeceras de caché** en `GET /api/photos/:id`. Independiente de todo lo
   demás, se puede hacer y desplegar solo.
2. **Extraer `almacen.ts`** con la implementación de disco. Sin cambio de
   comportamiento; los tests de API existentes tienen que seguir en verde.
3. **Crear el bucket** en Cloudflare (privado, sin dominio público) y un token
   de API con permiso de lectura/escritura sólo sobre ese bucket.
4. **Implementar `almacenR2`.**
5. **Subir los 254 archivos que ya existen** con un script de una sola vez
   (abajo).
6. **Verificar** contra el bucket antes de cambiar nada en producción.
7. **`DUETTE_ALMACEN=r2`** en `/etc/duette-api.env` y reiniciar. Los archivos
   locales **se quedan donde están**.
8. **Usar la app un tiempo.** Subir, ver, borrar, salir de una pareja.
9. **Recién entonces** borrar `uploads/` del VPS, y no antes.

### Cómo hablar con R2

R2 es compatible con S3. Dos caminos:

- **`aws4fetch`** — ~10 KB, sólo firma SigV4 y usa `fetch`. Encaja con el resto
  del proyecto, que evita dependencias pesadas a propósito (`node:sqlite`,
  TypeScript nativo, sin paso de build). **Recomendado.**
- `@aws-sdk/client-s3` — funciona, pero arrastra decenas de megas de
  dependencias para cuatro operaciones.

Firmar SigV4 a mano es posible pero es exactamente el tipo de código donde un
error se paga caro y en silencio. No lo hagas.

### Credenciales

Van a `/etc/duette-api.env`, junto a `CLERK_SECRET_KEY` (root, 600):

```
DUETTE_ALMACEN=r2
R2_ACCOUNT_ID=...
R2_BUCKET=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Nunca en el repo. El `.env.local` de desarrollo puede quedarse en `disco` para
no tocar el bucket real desde la laptop.

### El script de migración

De una sola vez, idempotente, y **que no borre nada**:

1. Leer de la base todos los nombres: `photos`, `staged_photos`,
   `inspiraciones`, columnas `archivo` y `archivo_min`.
2. Subir cada uno que no esté ya en el bucket.
3. Comparar: cantidad de objetos vs cantidad de nombres en la base.
4. Verificar por hash **una muestra** (10 archivos alcanza) — descargar de R2 y
   comparar sha256 con el archivo local.
5. Informar los huérfanos en los dos sentidos: archivos en disco sin fila en la
   base, y filas cuya foto no está en disco. Hoy no debería haber ninguno; si
   aparecen, entender por qué **antes** de seguir.

### Cómo volver atrás

Mientras los archivos locales sigan ahí, volver es cambiar `DUETTE_ALMACEN` a
`disco` y reiniciar. Por eso el paso 9 va último y separado en el tiempo.

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

**El borrado hoy es best-effort.** `borrarArchivos` hace
`.catch(() => {})` — si falla, el archivo queda huérfano en el disco y a nadie
le importa. Con R2 ese huérfano se paga todos los meses. Registrar los fallos
al menos, y de paso pensar una limpieza periódica que compare bucket contra
base.

**R2 no versiona por defecto.** Si un bug borra objetos, no hay papelera. Dado
lo que ya pasó una vez con los datos reales, conviene habilitar versionado de
objetos en el bucket, o una regla de ciclo de vida que retenga los borrados
unos días. No es opcional en la práctica.

**El borrado en lote.** `borrarArchivos` recibe un array; salir de una pareja
puede borrar cientos de archivos de una. R2 soporta `DeleteObjects` en lotes de
1000: usarlo, y no mil pedidos sueltos.

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
  el almacenamiento de objetos no sirve para eso.
- **No** guardar URLs completas en las columnas `archivo`. El nombre pelado es
  lo que hace que cambiar de proveedor sea barato.
- **No** borrar `uploads/` el mismo día que se cambia el flag.
