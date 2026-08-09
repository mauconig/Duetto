/** El service worker descifra las fotos con su propia copia de la derivación,
 * porque no puede importar del bundle. Dos implementaciones de lo mismo es
 * exactamente donde aparecen los bugs que no se ven: un `info` distinto por una
 * letra no rompe nada al compilar, no rompe nada al cifrar, y se manifiesta
 * meses después como fotos que no abren.
 *
 * Esta prueba no reimplementa el worker: **lee `public/sw.js` de verdad**,
 * saca las dos funciones y las hace interoperar con `cripto.ts`. Si alguien
 * cambia una de las dos y no la otra, esto falla acá y no en el teléfono de
 * alguien. */
import { ok, rejects, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { bytesAlAzar, cifrar, cifrarConPareja, generarLlaveDePareja, llaveDeArchivo } from './cripto.ts'

const RUTA_SW = fileURLToPath(new URL('../../public/sw.js', import.meta.url))
const fuente = readFileSync(RUTA_SW, 'utf8')

/** Saca una declaración `async function <nombre>(...) { ... }` contando llaves,
 * que es suficiente para este archivo y no arrastra un parser entero. */
function extraer(nombre: string): string {
  const inicio = fuente.indexOf(`async function ${nombre}(`)
  if (inicio === -1) throw new Error(`sw.js ya no tiene una función ${nombre}`)
  let nivel = 0
  for (let i = fuente.indexOf('{', inicio); i < fuente.length; i++) {
    if (fuente[i] === '{') nivel++
    else if (fuente[i] === '}' && --nivel === 0) return fuente.slice(inicio, i + 1)
  }
  throw new Error(`no se pudo delimitar ${nombre} en sw.js`)
}

/** Las constantes del formato, sacadas del worker igual que las funciones: si
 * el largo del IV o la versión cambian de un solo lado, tiene que verse acá. */
function extraerConstante(nombre: string): string {
  const m = new RegExp(`^const ${nombre} = .+$`, 'm').exec(fuente)
  if (!m) throw new Error(`sw.js ya no define ${nombre}`)
  return m[0]
}

/** Las dos funciones del worker, construidas desde su propio código fuente. */
const delWorker = new Function(`
  ${extraerConstante('LARGO_IV')}
  ${extraerConstante('LARGO_ID')}
  ${extraerConstante('VERSION_ARCHIVO')}
  ${extraer('llaveDeArchivo')}
  ${extraer('descifrarSobre')}
  return { llaveDeArchivo, descifrarSobre }
`)() as {
  llaveDeArchivo: (llave: Uint8Array, id: Uint8Array) => Promise<CryptoKey>
  descifrarSobre: (sobre: ArrayBuffer, llave: Uint8Array) => Promise<ArrayBuffer>
}

const comoBuffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe('el service worker y cripto.ts hablan el mismo idioma', () => {
  test('una foto del tamaño real cifrada por la app la abre el worker', async () => {
    // Es la prueba que importa: si el `info` del HKDF, el largo del id o el
    // orden de los campos difieren en algo, esto falla acá y no en un teléfono.
    const pareja = generarLlaveDePareja()
    const datos = bytesAlAzar(700 * 1024)
    const sobre = await cifrarConPareja(datos, pareja)
    const abierto = new Uint8Array(await delWorker.descifrarSobre(comoBuffer(sobre), pareja))
    strictEqual(Buffer.from(abierto).toString('base64'), Buffer.from(datos).toString('base64'))
  })

  test('sirve para cualquier tamaño, incluido el vacío', async () => {
    const pareja = generarLlaveDePareja()
    for (const n of [0, 1, 15, 16, 17, 4096]) {
      const datos = bytesAlAzar(n)
      const abierto = new Uint8Array(
        await delWorker.descifrarSobre(comoBuffer(await cifrarConPareja(datos, pareja)), pareja),
      )
      strictEqual(Buffer.from(abierto).toString('base64'), Buffer.from(datos).toString('base64'), `falló con ${n} bytes`)
    }
  })

  test('el worker deriva la misma llave por archivo que la app', async () => {
    const pareja = generarLlaveDePareja()
    const id = bytesAlAzar(16)
    const datos = bytesAlAzar(64)
    // Cifrado con la llave de la app, abierto con la llave del worker.
    const conLaDeLaApp = await cifrar(datos, await llaveDeArchivo(pareja, id))
    const clave = await delWorker.llaveDeArchivo(pareja, id)
    ok(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: conLaDeLaApp.subarray(1, 13) as BufferSource },
      clave,
      conLaDeLaApp.subarray(13) as BufferSource,
    ))
  })

  test('el worker no abre el sobre de otra pareja', async () => {
    const sobre = await cifrarConPareja(bytesAlAzar(64), generarLlaveDePareja())
    await rejects(() => delWorker.descifrarSobre(comoBuffer(sobre), generarLlaveDePareja()))
  })

  test('el worker rechaza un sobre de versión desconocida', async () => {
    const pareja = generarLlaveDePareja()
    const sobre = await cifrarConPareja(bytesAlAzar(64), pareja)
    sobre[0] = 99
    await rejects(() => delWorker.descifrarSobre(comoBuffer(sobre), pareja), /desconocida/)
  })

  test('el worker rechaza el sobre de envolver llaves, que es el otro formato', async () => {
    const pareja = generarLlaveDePareja()
    const clave = await llaveDeArchivo(pareja, bytesAlAzar(16))
    const otroFormato = await cifrar(bytesAlAzar(32), clave)
    await rejects(() => delWorker.descifrarSobre(comoBuffer(otroFormato), pareja), /desconocida/)
  })

  test('sigue leyendo la cabecera que el servidor manda', () => {
    // El worker decide descifrar por X-Cifrado; si el nombre cambia de un lado
    // solo, las fotos cifradas se sirven como si fueran WebP.
    ok(fuente.includes("headers.get('X-Cifrado')"), 'sw.js ya no mira X-Cifrado')
  })
})
