/** Cifrado de extremo a extremo: todo lo que toca llaves vive acá.
 *
 * Nada de este archivo habla con la red ni con el DOM. Es a propósito — es lo
 * que permite probarlo entero contra `node:test` sin levantar la app, y lo que
 * hace que un error de cripto se vea con blobs al azar en vez de con las fotos
 * de alguien. Ver `plan.md`, "Pendiente: cifrado de extremo a extremo".
 *
 * La regla que ordena todo lo demás: **la llave de pareja nunca sale del
 * dispositivo en claro**. El servidor guarda la versión envuelta, el salt y
 * los parámetros del KDF, y con eso no puede abrir nada.
 */

/** Parámetros del KDF, guardados junto a la llave envuelta en vez de estar
 * hardcodeados acá. Es lo que permite subir el costo más adelante —o cambiar a
 * Argon2id— sin dejar afuera a las parejas que ya tenían su frase: cada una se
 * abre con los parámetros con los que se cerró. */
export interface ParamsKdf {
  nombre: 'PBKDF2-SHA256'
  iteraciones: number
}

/** 600.000 es el mínimo que OWASP acepta hoy para PBKDF2-HMAC-SHA256.
 *
 * Argon2id sería mejor —resiste GPU, que es de lo que se trata— pero exige
 * traer un WASM. PBKDF2 ya está en WebCrypto, así que esto arranca sin
 * dependencias nuevas y `ParamsKdf` deja la puerta abierta a cambiarlo. */
export const KDF_ACTUAL: ParamsKdf = { nombre: 'PBKDF2-SHA256', iteraciones: 600_000 }

const LARGO_SALT = 16
/** 96 bits es el IV que AES-GCM espera; otro largo lo hace pasar por un hash
 * interno y sale del camino probado. */
const LARGO_IV = 12

/** Primer byte de todo lo cifrado. Son dos formatos y por eso son dos números:
 * mezclarlos falla de entrada en vez de descifrar cualquier cosa.
 *
 * `SOBRE` es el simple —`[1][iv][cifrado]`— y se usa para envolver la llave de
 * pareja, donde la llave que abre ya viene del KDF con su propio salt.
 *
 * `ARCHIVO` es el que llevan fotos y textos: `[2][id:16][iv][cifrado]`. El id
 * de derivación lo elige el cliente al azar y viaja **adentro** del sobre, que
 * es lo que lo vuelve autocontenido.
 *
 * Eso último no es un adorno. Derivarlo del id de la fila —que era la idea
 * original— no podía funcionar: una foto entra a `staged_photos` con un id y
 * el servidor le asigna **otro** al moverla a `photos`. El service worker
 * habría derivado con el id final una llave que nadie usó para cifrar. */
const VERSION_SOBRE = 1
const VERSION_ARCHIVO = 2
const LARGO_ID = 16

const cripto = () => globalThis.crypto

/** `getRandomValues` rechaza pedidos de más de 65.536 bytes — es un límite de
 * la especificación, no de una implementación. Nada en producción pide más que
 * 32, pero el nombre de esta función no lo sugiere, así que se llena por
 * tramos en vez de tirar en el único caso que nadie va a probar a mano. */
const MAX_AZAR = 65_536

export function bytesAlAzar(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  for (let i = 0; i < n; i += MAX_AZAR) {
    cripto().getRandomValues(bytes.subarray(i, Math.min(i + MAX_AZAR, n)))
  }
  return bytes
}

/** La llave de la pareja: 256 bits al azar. No se deriva de la frase — la
 * frase sólo la envuelve. Así, cambiar la frase es volver a envolver la misma
 * llave, y no volver a cifrar cada foto. */
export function generarLlaveDePareja(): Uint8Array {
  return bytesAlAzar(32)
}

export function generarSalt(): Uint8Array {
  return bytesAlAzar(LARGO_SALT)
}

/** Crockford base32 sin I, L, O ni U: ni se confunden entre sí ni forman
 * palabras por accidente. Son exactamente 32 símbolos, así que `byte % 32` no
 * tiene sesgo de módulo y no hace falta descartar y reintentar. */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const GRUPOS = 5
const POR_GRUPO = 5

/** El código de recuperación: 25 símbolos = 125 bits, en grupos de 5 para que
 * se pueda copiar a mano sin perder la cuenta.
 *
 * Es la única otra cosa que abre la llave. Se muestra una vez al activar el
 * cifrado, y si se pierden la frase y el código no hay nadie —yo tampoco— que
 * pueda recuperar las fotos. */
export function generarCodigoRecuperacion(): string {
  const bytes = bytesAlAzar(GRUPOS * POR_GRUPO)
  const simbolos = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length])
  return Array.from({ length: GRUPOS }, (_, i) => simbolos.slice(i * POR_GRUPO, (i + 1) * POR_GRUPO).join('')).join('-')
}

/** Acepta el código como lo haya tipeado el usuario: sin guiones, con espacios,
 * en minúscula. Lo que no hace es corregir símbolos ambiguos — un cero no se
 * convierte en O, porque O no existe en el alfabeto y confundirlos en silencio
 * escondería un código realmente equivocado. */
export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/** Deriva la llave que envuelve, desde la frase de acceso o desde el código de
 * recuperación. Los dos entran por acá: son dos secretos distintos que abren la
 * misma llave de pareja, cada uno con su propio salt. */
export async function derivarEnvoltura(secreto: string, salt: Uint8Array, params: ParamsKdf): Promise<CryptoKey> {
  if (params.nombre !== 'PBKDF2-SHA256') throw new Error(`KDF desconocido: ${params.nombre}`)
  const base = await cripto().subtle.importKey('raw', new TextEncoder().encode(secreto), 'PBKDF2', false, [
    'deriveKey',
  ])
  return cripto().subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: params.iteraciones, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    // No exportable: la llave de envoltura no tiene por qué salir nunca de
    // WebCrypto, y marcarlo hace que un bug no pueda filtrarla.
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Una llave distinta por archivo, derivada de un id que va dentro del sobre.
 *
 * Como el id son 128 bits al azar por archivo, dos archivos no comparten llave
 * ni en la práctica ni en teoría. Eso es lo que hace seguro sortear el IV: lo
 * que no puede repetirse es el par (llave, IV), y acá ya no se repite la
 * llave. */
export async function llaveDeArchivo(llaveDePareja: Uint8Array, id: Uint8Array): Promise<CryptoKey> {
  const base = await cripto().subtle.importKey('raw', llaveDePareja as BufferSource, 'HKDF', false, ['deriveKey'])
  return cripto().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: etiquetaDe(id) as BufferSource },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** El `info` del HKDF. Tiene que ser byte por byte igual al de `sw.js`: forma
 * parte de la llave, así que una diferencia de un carácter se ve como fotos
 * que no abren. Hay una prueba que compara las dos implementaciones. */
function etiquetaDe(id: Uint8Array): Uint8Array {
  const prefijo = new TextEncoder().encode('pictogether/archivo/')
  const etiqueta = new Uint8Array(prefijo.length + id.length)
  etiqueta.set(prefijo)
  etiqueta.set(id, prefijo.length)
  return etiqueta
}

/** Lo que se usa para fotos y para textos: cifra con una llave propia de este
 * archivo y devuelve un sobre que se abre solo con la llave de pareja. */
export async function cifrarConPareja(datos: Uint8Array, llaveDePareja: Uint8Array): Promise<Uint8Array> {
  const id = bytesAlAzar(LARGO_ID)
  const iv = bytesAlAzar(LARGO_IV)
  const llave = await llaveDeArchivo(llaveDePareja, id)
  const cerrado = new Uint8Array(
    await cripto().subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, llave, datos as BufferSource),
  )
  const sobre = new Uint8Array(1 + LARGO_ID + LARGO_IV + cerrado.length)
  sobre[0] = VERSION_ARCHIVO
  sobre.set(id, 1)
  sobre.set(iv, 1 + LARGO_ID)
  sobre.set(cerrado, 1 + LARGO_ID + LARGO_IV)
  return sobre
}

export async function descifrarConPareja(sobre: Uint8Array, llaveDePareja: Uint8Array): Promise<Uint8Array> {
  if (sobre.length <= 1 + LARGO_ID + LARGO_IV) throw new Error('Sobre incompleto')
  if (sobre[0] !== VERSION_ARCHIVO) throw new Error(`Versión de cifrado desconocida: ${sobre[0]}`)
  const llave = await llaveDeArchivo(llaveDePareja, sobre.subarray(1, 1 + LARGO_ID))
  return new Uint8Array(
    await cripto().subtle.decrypt(
      { name: 'AES-GCM', iv: sobre.subarray(1 + LARGO_ID, 1 + LARGO_ID + LARGO_IV) as BufferSource },
      llave,
      sobre.subarray(1 + LARGO_ID + LARGO_IV) as BufferSource,
    ),
  )
}

/** El sobre: `[versión:1][iv:12][cifrado+tag]`, todo en un solo Uint8Array.
 * Se guarda y se transmite como una unidad para que no exista el estado en que
 * el IV se perdió y los bytes quedaron ilegibles para siempre. */
export async function cifrar(datos: Uint8Array, llave: CryptoKey): Promise<Uint8Array> {
  const iv = bytesAlAzar(LARGO_IV)
  const cerrado = new Uint8Array(
    await cripto().subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, llave, datos as BufferSource),
  )
  const sobre = new Uint8Array(1 + LARGO_IV + cerrado.length)
  sobre[0] = VERSION_SOBRE
  sobre.set(iv, 1)
  sobre.set(cerrado, 1 + LARGO_IV)
  return sobre
}

/** Tira si el sobre está cortado, si la versión no se conoce o si la llave no
 * es la correcta — AES-GCM verifica el tag, así que una llave equivocada falla
 * en vez de devolver basura. Quien llama no tiene que validar nada de eso. */
export async function descifrar(sobre: Uint8Array, llave: CryptoKey): Promise<Uint8Array> {
  if (sobre.length <= 1 + LARGO_IV) throw new Error('Sobre incompleto')
  if (sobre[0] !== VERSION_SOBRE) throw new Error(`Versión de cifrado desconocida: ${sobre[0]}`)
  const iv = sobre.subarray(1, 1 + LARGO_IV)
  const cuerpo = sobre.subarray(1 + LARGO_IV)
  return new Uint8Array(
    await cripto().subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, llave, cuerpo as BufferSource),
  )
}

/** Envuelve la llave de pareja con la derivada del secreto. Lo que devuelve es
 * lo único que se guarda en el servidor, junto al salt y los parámetros. */
export async function envolverLlave(llaveDePareja: Uint8Array, envoltura: CryptoKey): Promise<Uint8Array> {
  return cifrar(llaveDePareja, envoltura)
}

export async function abrirLlave(envuelta: Uint8Array, envoltura: CryptoKey): Promise<Uint8Array> {
  const abierta = await descifrar(envuelta, envoltura)
  if (abierta.length !== 32) throw new Error('La llave abierta no mide 256 bits')
  return abierta
}

const textoADes = new TextEncoder()
const desATexto = new TextDecoder()

/** Notas, nombres de carpetas, ideas y nombres: el mismo sobre autocontenido
 * que las fotos, porque tampoco tienen un id estable cuando se escriben — una
 * carpeta se nombra antes de que exista su fila.
 *
 * Devuelve base64 y no bytes: estos van a columnas de texto y a JSON, y
 * convertirlos acá evita que cada sitio que llama se acuerde de hacerlo. */
export async function cifrarTexto(texto: string, llaveDePareja: Uint8Array): Promise<string> {
  return aBase64(await cifrarConPareja(textoADes.encode(texto), llaveDePareja))
}

export async function descifrarTexto(base64: string, llaveDePareja: Uint8Array): Promise<string> {
  return desATexto.decode(await descifrarConPareja(deBase64(base64), llaveDePareja))
}

/** Para meter un sobre en una columna de texto y en JSON. base64 y no hex
 * porque son 4 bytes de columna por cada 3 de dato en vez de 2 por 1, y esto
 * va a guardar cada nota de cada recuerdo. */
export function aBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function deBase64(texto: string): Uint8Array {
  const bin = atob(texto)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
