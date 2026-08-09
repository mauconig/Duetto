/** Pruebas de `cripto.ts`. Corren con `node --test src/lib/cripto.test.ts`.
 *
 * El plan pide probar esto **antes** de tocar la app, y con datos al azar: un
 * error acá no se ve como una excepción, se ve como fotos que no abren más.
 * Por eso las dos que más importan no son las de ida y vuelta sino
 * "frase equivocada falla" y "el sobre alterado falla" — que sean errores y no
 * bytes mal descifrados es todo el punto de AES-GCM. */
import { deepStrictEqual, notStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  KDF_ACTUAL,
  aBase64,
  abrirLlave,
  bytesAlAzar,
  cifrar,
  cifrarTexto,
  deBase64,
  derivarEnvoltura,
  descifrar,
  descifrarTexto,
  envolverLlave,
  generarCodigoRecuperacion,
  generarLlaveDePareja,
  generarSalt,
  llaveDeArchivo,
  normalizarCodigo,
} from './cripto.ts'

/** 600.000 iteraciones tardan ~0,4 s cada una; a ese costo una suite honesta
 * no termina nunca. Las pruebas que no miden el KDF usan un costo mínimo — lo
 * que se prueba ahí es el envoltorio, no cuán caro es derivar. */
const KDF_RAPIDO = { nombre: 'PBKDF2-SHA256', iteraciones: 1 } as const

describe('sobres', () => {
  test('ida y vuelta con 1000 blobs al azar de tamaños distintos', async () => {
    const llave = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    for (let i = 0; i < 1000; i++) {
      const datos = bytesAlAzar(i % 97)
      deepStrictEqual(await descifrar(await cifrar(datos, llave), llave), datos)
    }
  })

  test('un blob del tamaño de una foto real sobrevive intacto', async () => {
    const llave = await llaveDeArchivo(generarLlaveDePareja(), 'foto-grande')
    const datos = bytesAlAzar(700 * 1024)
    deepStrictEqual(await descifrar(await cifrar(datos, llave), llave), datos)
  })

  test('el mismo texto cifrado dos veces da sobres distintos', async () => {
    // Si el IV se repitiera, dos fotos iguales se verían iguales cifradas y
    // eso solo ya filtra información.
    const llave = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    const datos = new TextEncoder().encode('lo mismo')
    notStrictEqual(aBase64(await cifrar(datos, llave)), aBase64(await cifrar(datos, llave)))
  })

  test('el cifrado no deja el original a la vista', async () => {
    const llave = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    const datos = new TextEncoder().encode('nuestro aniversario en Encarnación')
    const sobre = await cifrar(datos, llave)
    ok(!aBase64(sobre).includes(aBase64(datos)))
  })

  test('una llave equivocada falla en vez de devolver basura', async () => {
    const buena = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    const otra = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    const sobre = await cifrar(bytesAlAzar(64), buena)
    await rejects(() => descifrar(sobre, otra))
  })

  test('la llave de un archivo no abre el sobre de otro', async () => {
    const pareja = generarLlaveDePareja()
    const sobre = await cifrar(bytesAlAzar(64), await llaveDeArchivo(pareja, 'foto-1'))
    const otroArchivo = await llaveDeArchivo(pareja, 'foto-2')
    await rejects(() => descifrar(sobre, otroArchivo))
  })

  test('alterar un solo bit del sobre lo hace fallar', async () => {
    const llave = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    const sobre = await cifrar(bytesAlAzar(64), llave)
    for (const i of [1, 5, 20, sobre.length - 1]) {
      const roto = Uint8Array.from(sobre)
      roto[i] ^= 1
      await rejects(() => descifrar(roto, llave), `el byte ${i} pasó sin detectarse`)
    }
  })

  test('un sobre cortado o de versión desconocida se rechaza sin romperse', async () => {
    const llave = await llaveDeArchivo(generarLlaveDePareja(), 'foto-1')
    const sobre = await cifrar(bytesAlAzar(64), llave)
    await rejects(() => descifrar(sobre.subarray(0, 8), llave), /incompleto/)
    const futuro = Uint8Array.from(sobre)
    futuro[0] = 99
    await rejects(() => descifrar(futuro, llave), /desconocida/)
  })
})

describe('llave de archivo', () => {
  test('es determinística: el mismo id da la misma llave', async () => {
    const pareja = generarLlaveDePareja()
    const sobre = await cifrar(bytesAlAzar(32), await llaveDeArchivo(pareja, 'foto-7'))
    // Derivada de nuevo desde cero, como pasa al abrir la app otro día.
    ok(await descifrar(sobre, await llaveDeArchivo(pareja, 'foto-7')))
  })

  test('parejas distintas no comparten llave para el mismo id', async () => {
    const sobre = await cifrar(bytesAlAzar(32), await llaveDeArchivo(generarLlaveDePareja(), 'foto-7'))
    const deOtraPareja = await llaveDeArchivo(generarLlaveDePareja(), 'foto-7')
    await rejects(() => descifrar(sobre, deOtraPareja))
  })
})

describe('frase de acceso', () => {
  test('la frase correcta abre la llave de pareja', async () => {
    const pareja = generarLlaveDePareja()
    const salt = generarSalt()
    const envuelta = await envolverLlave(pareja, await derivarEnvoltura('caballo azul', salt, KDF_RAPIDO))
    // Lo que haría otro dispositivo: sólo tiene el salt y lo que la persona escribe.
    deepStrictEqual(await abrirLlave(envuelta, await derivarEnvoltura('caballo azul', salt, KDF_RAPIDO)), pareja)
  })

  test('la frase equivocada falla y no devuelve nada', async () => {
    const salt = generarSalt()
    const envuelta = await envolverLlave(generarLlaveDePareja(), await derivarEnvoltura('correcta', salt, KDF_RAPIDO))
    const conLaOtra = await derivarEnvoltura('incorrecta', salt, KDF_RAPIDO)
    await rejects(() => abrirLlave(envuelta, conLaOtra))
  })

  test('la misma frase con otro salt no abre', async () => {
    // Es lo que impide que una tabla precalculada sirva para varias parejas.
    const envuelta = await envolverLlave(generarLlaveDePareja(), await derivarEnvoltura('igual', generarSalt(), KDF_RAPIDO))
    const conOtroSalt = await derivarEnvoltura('igual', generarSalt(), KDF_RAPIDO)
    await rejects(() => abrirLlave(envuelta, conOtroSalt))
  })

  test('la llave envuelta no contiene la llave en claro', async () => {
    const pareja = generarLlaveDePareja()
    const envuelta = await envolverLlave(pareja, await derivarEnvoltura('frase', generarSalt(), KDF_RAPIDO))
    ok(!aBase64(envuelta).includes(aBase64(pareja)))
  })

  test('cambiar la frase no obliga a recifrar: es la misma llave envuelta de nuevo', async () => {
    const pareja = generarLlaveDePareja()
    const sobre = await cifrar(bytesAlAzar(64), await llaveDeArchivo(pareja, 'foto-1'))
    const salt = generarSalt()
    const nueva = await envolverLlave(pareja, await derivarEnvoltura('frase nueva', salt, KDF_RAPIDO))
    const recuperada = await abrirLlave(nueva, await derivarEnvoltura('frase nueva', salt, KDF_RAPIDO))
    // La foto de antes sigue abriéndose, que es el punto de no derivar la
    // llave de pareja desde la frase.
    ok(await descifrar(sobre, await llaveDeArchivo(recuperada, 'foto-1')))
  })

  test('los parámetros guardados son los que se usan al abrir', async () => {
    const pareja = generarLlaveDePareja()
    const salt = generarSalt()
    const envuelta = await envolverLlave(pareja, await derivarEnvoltura('frase', salt, { nombre: 'PBKDF2-SHA256', iteraciones: 2 }))
    // Subir el costo sin volver a envolver dejaría afuera a esa pareja.
    const conOtroCosto = await derivarEnvoltura('frase', salt, { nombre: 'PBKDF2-SHA256', iteraciones: 3 })
    await rejects(() => abrirLlave(envuelta, conOtroCosto))
  })
})

describe('código de recuperación', () => {
  test('abre la misma llave que la frase, con su propio salt', async () => {
    const pareja = generarLlaveDePareja()
    const codigo = generarCodigoRecuperacion()
    const saltFrase = generarSalt()
    const saltCodigo = generarSalt()
    const porFrase = await envolverLlave(pareja, await derivarEnvoltura('frase', saltFrase, KDF_RAPIDO))
    const porCodigo = await envolverLlave(pareja, await derivarEnvoltura(codigo, saltCodigo, KDF_RAPIDO))
    // Con la frase olvidada, el código llega a la misma llave.
    deepStrictEqual(await abrirLlave(porCodigo, await derivarEnvoltura(codigo, saltCodigo, KDF_RAPIDO)), pareja)
    deepStrictEqual(await abrirLlave(porFrase, await derivarEnvoltura('frase', saltFrase, KDF_RAPIDO)), pareja)
  })

  test('tiene el formato y la entropía esperados', () => {
    const codigo = generarCodigoRecuperacion()
    ok(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/.test(codigo), codigo)
    strictEqual(codigo.replace(/-/g, '').length, 25) // 25 símbolos x 5 bits = 125 bits
  })

  test('no repite: 2000 códigos son 2000 distintos', () => {
    const vistos = new Set(Array.from({ length: 2000 }, generarCodigoRecuperacion))
    strictEqual(vistos.size, 2000)
  })

  test('nunca usa los símbolos ambiguos', () => {
    const juntos = Array.from({ length: 500 }, generarCodigoRecuperacion).join('')
    for (const c of 'ILOU') ok(!juntos.includes(c), `apareció ${c}`)
  })

  test('se acepta como lo tipea la gente, pero no se corrigen símbolos', () => {
    strictEqual(normalizarCodigo('abcde-fghjk'), 'ABCDEFGHJK')
    strictEqual(normalizarCodigo('  ABCDE fghjk '), 'ABCDEFGHJK')
    // Un cero sigue siendo un cero: convertirlo en O escondería un error real.
    strictEqual(normalizarCodigo('0BCDE'), '0BCDE')
  })
})

describe('textos', () => {
  test('ida y vuelta, incluidos acentos y emoji', async () => {
    const pareja = generarLlaveDePareja()
    for (const texto of ['', 'Nuestro aniversario', 'Encarnación 🌅', 'a'.repeat(5000), 'ñ'.repeat(300)]) {
      strictEqual(await descifrarTexto(await cifrarTexto(texto, pareja), pareja), texto)
    }
  })

  test('otra pareja no lee la nota', async () => {
    const sobre = await cifrarTexto('privado', generarLlaveDePareja())
    await rejects(() => descifrarTexto(sobre, generarLlaveDePareja()))
  })
})

describe('base64', () => {
  test('ida y vuelta con bytes al azar, incluido el vacío', () => {
    for (let i = 0; i < 200; i++) {
      const bytes = bytesAlAzar(i)
      deepStrictEqual(deBase64(aBase64(bytes)), bytes)
    }
  })

  test('sobrevive a los bytes altos, que es donde falla el atajo obvio', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    deepStrictEqual(deBase64(aBase64(bytes)), bytes)
  })
})

describe('el costo real del KDF', () => {
  test('los parámetros de producción tardan lo suficiente como para molestar a quien pruebe frases', async () => {
    const empezo = performance.now()
    await derivarEnvoltura('frase de prueba', generarSalt(), KDF_ACTUAL)
    const ms = performance.now() - empezo
    // No es una prueba de rendimiento: es que 600.000 iteraciones estén
    // realmente ocurriendo. Un KDF que tarda 3 ms no protege nada.
    ok(ms > 50, `el KDF tardó ${ms.toFixed(0)} ms, demasiado poco`)
    console.log(`    KDF de producción: ${ms.toFixed(0)} ms por intento`)
  })
})
