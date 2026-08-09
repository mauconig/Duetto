/** Where the couple key lives on this device, and the only place that decides
 * when it may be written down.
 *
 * `cripto.ts` knows how to turn secrets into keys and bytes into ciphertext.
 * This knows *whose* key is loaded right now, how it got here, and who else
 * needs to be told — the service worker, which cannot ask the user anything
 * and has to be handed the key by a page that can.
 */
import {
  KDF_ACTUAL,
  type ParamsKdf,
  aBase64,
  abrirLlave,
  deBase64,
  derivarEnvoltura,
  envolverLlave,
  generarCodigoRecuperacion,
  generarLlaveDePareja,
  generarSalt,
  normalizarCodigo,
} from './cripto'

/** What the server hands back about a couple's encryption. Everything here is
 * useless without a secret the server has never seen. */
export type EstadoCifrado =
  | { activo: false }
  | {
      activo: true
      llaveEnvuelta: string
      kdfSalt: string
      kdfParams: ParamsKdf
      llaveCodigo: string
      kdfSaltCodigo: string
      pendientes: Pendientes
    }

export interface Pendientes {
  fotos: number
  inspiraciones: number
  notas: number
  carpetas: number
  ideas: number
}

export const faltaMigrar = (p: Pendientes) => p.fotos + p.inspiraciones + p.notas + p.carpetas + p.ideas

/** In memory, never in a module the bundler could tree-shake into a global.
 * Cleared by closing the tab, which is the behaviour someone who did *not*
 * tick "remember this device" is entitled to expect. */
let llaveEnMemoria: Uint8Array | null = null

export const llaveActual = () => llaveEnMemoria

const oyentes = new Set<(k: Uint8Array | null) => void>()

export function alCambiarLlave(fn: (k: Uint8Array | null) => void) {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

function fijar(k: Uint8Array | null) {
  llaveEnMemoria = k
  for (const fn of oyentes) fn(k)
  // The service worker decrypts photos, so it needs this as much as the page
  // does — and it can't prompt for a passphrase itself.
  avisarAlWorker(k)
}

/* ------------------------------------------------------ recordar el aparato */

const BASE = 'pictogether-llave'
const ALMACEN = 'llaves'
const CLAVE = 'pareja'

/** Opening the key in a passphrase prompt every single time is what makes
 * people turn encryption off. The trade is explicit: on a device marked as
 * remembered, the key sits in IndexedDB, so anyone who can unlock the phone
 * can open the photos. That is the same bargain as staying signed in, and it
 * is worth saying plainly on the screen that offers it. */
function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(BASE, 1)
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN)
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rechazar(pedido.error)
  })
}

async function conAlmacen<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  try {
    const base = await abrirBase()
    return await new Promise<T | null>((resolver, rechazar) => {
      const pedido = fn(base.transaction(ALMACEN, modo).objectStore(ALMACEN))
      pedido.onsuccess = () => resolver((pedido.result as T) ?? null)
      pedido.onerror = () => rechazar(pedido.error)
    })
  } catch {
    // Private mode, storage disabled, iOS having evicted the database. None of
    // these are worth an error: the passphrase prompt is the fallback and it
    // always works.
    return null
  }
}

export async function recordarEnEsteAparato(llave: Uint8Array) {
  await conAlmacen('readwrite', (s) => s.put(llave, CLAVE))
}

export async function leerDeEsteAparato(): Promise<Uint8Array | null> {
  const guardada = await conAlmacen<Uint8Array>('readonly', (s) => s.get(CLAVE))
  return guardada && guardada.length === 32 ? new Uint8Array(guardada) : null
}

export async function olvidarEsteAparato() {
  await conAlmacen('readwrite', (s) => s.delete(CLAVE))
}

/* ------------------------------------------------------------- el worker */

function avisarAlWorker(llave: Uint8Array | null) {
  navigator.serviceWorker?.controller?.postMessage(
    llave ? { tipo: 'llave', llave } : { tipo: 'olvidar-llave' },
  )
}

/** The service worker is killed and restarted freely — aggressively so on iOS,
 * which is where most of these couples are. When it comes back it has no key
 * and asks whoever is on screen for one; this is that answer. */
export function atenderPedidosDelWorker() {
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.tipo === 'necesito-llave') avisarAlWorker(llaveEnMemoria)
  })
}

/* --------------------------------------------------------------- acciones */

/** Turning encryption on. Generates the key, wraps it twice, and returns both
 * the body the server needs and the recovery code — which is shown once and
 * then only exists wherever the couple wrote it down. */
export async function prepararActivacion(frase: string) {
  const llave = generarLlaveDePareja()
  const codigo = generarCodigoRecuperacion()
  const kdfSalt = generarSalt()
  const kdfSaltCodigo = generarSalt()
  const [porFrase, porCodigo] = await Promise.all([
    envolverLlave(llave, await derivarEnvoltura(frase, kdfSalt, KDF_ACTUAL)),
    envolverLlave(llave, await derivarEnvoltura(normalizarCodigo(codigo), kdfSaltCodigo, KDF_ACTUAL)),
  ])
  return {
    llave,
    codigo,
    cuerpo: {
      llaveEnvuelta: aBase64(porFrase),
      kdfSalt: aBase64(kdfSalt),
      kdfParams: KDF_ACTUAL,
      llaveCodigo: aBase64(porCodigo),
      kdfSaltCodigo: aBase64(kdfSaltCodigo),
    },
  }
}

/** Opens the couple key with whichever secret the person has. Throws when it
 * doesn't fit — AES-GCM checks its own tag, so a wrong passphrase fails
 * instead of producing a key that would quietly ruin every photo it touched. */
export async function desbloquear(secreto: string, estado: EstadoCifrado, con: 'frase' | 'codigo') {
  if (!estado.activo) throw new Error('El cifrado no está activado')
  const esCodigo = con === 'codigo'
  const envuelta = deBase64(esCodigo ? estado.llaveCodigo : estado.llaveEnvuelta)
  const salt = deBase64(esCodigo ? estado.kdfSaltCodigo : estado.kdfSalt)
  const llave = await abrirLlave(envuelta, await derivarEnvoltura(esCodigo ? normalizarCodigo(secreto) : secreto, salt, estado.kdfParams))
  fijar(llave)
  return llave
}

/** Rewraps the key already in memory under a new passphrase. Deliberately
 * takes the loaded key rather than the old passphrase: you can only change it
 * from a session that is already unlocked, and nothing has to be re-encrypted. */
export async function prepararCambioDeFrase(frase: string) {
  const llave = llaveEnMemoria
  if (!llave) throw new Error('Primero desbloqueá con la frase actual')
  const kdfSalt = generarSalt()
  const envuelta = await envolverLlave(llave, await derivarEnvoltura(frase, kdfSalt, KDF_ACTUAL))
  return { llaveEnvuelta: aBase64(envuelta), kdfSalt: aBase64(kdfSalt), kdfParams: KDF_ACTUAL }
}

/** Used right after activation, and by "remember this device" on load. */
export function cargarEnMemoria(llave: Uint8Array) {
  fijar(llave)
}

/** Locks this session without forgetting the device. */
export function bloquear() {
  fijar(null)
}

/** Turning the device's memory off *and* locking, which is what the profile
 * screen's "olvidar en este aparato" means. */
export async function olvidarTodo() {
  await olvidarEsteAparato()
  fijar(null)
}
