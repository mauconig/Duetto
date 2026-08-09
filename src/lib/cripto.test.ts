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
  cifrarConPareja,
  cifrarTexto,
  deBase64,
  derivarEnvoltura,
  descifrar,
  descifrarConPareja,
  descifrarTexto,
  envolverLlave,
  generarCodigoRecuperacion,
  generarLlaveDePareja,
  generarSalt,
  normalizarCodigo,
} from './cripto.ts'

/** 600.000 iteraciones tardan ~0,4 s cada una; a ese costo una suite honesta
 * no termina nunca. Las pruebas que no miden el KDF usan un costo mínimo — lo
 * que se prueba ahí es el envoltorio, no cuán caro es derivar. */
const KDF_RAPIDO = { nombre: 'PBKDF2-SHA256', iteraciones: 1 } as const

describe('sobres', () => {
  test('ida y vuelta con 1000 blobs al azar de tamaños distintos', async () => {
    const pareja = generarLlaveDePareja()
    for (let i = 0; i < 1000; i++) {
      const datos = bytesAlAzar(i % 97)
      deepStrictEqual(await descifrarConPareja(await cifrarConPareja(datos, pareja), pareja), datos)
    }
  })

  test('un blob del tamaño de una foto real sobrevive intacto', async () => {
    const pareja = generarLlaveDePareja()
    const datos = bytesAlAzar(700 * 1024)
    deepStrictEqual(await descifrarConPareja(await cifrarConPareja(datos, pareja), pareja), datos)
  })

  test('el mismo texto cifrado dos veces da sobres distintos', async () => {
    // Si el IV se repitiera, dos fotos iguales se verían iguales cifradas y
    // eso solo ya filtra información.
    const pareja = generarLlaveDePareja()
    const datos = new TextEncoder().encode('lo mismo')
    notStrictEqual(aBase64(await cifrarConPareja(datos, pareja)), aBase64(await cifrarConPareja(datos, pareja)))
  })

  test('el cifrado no deja el original a la vista', async () => {
    const pareja = generarLlaveDePareja()
    const datos = new TextEncoder().encode('nuestro aniversario en Encarnación')
    const sobre = await cifrarConPareja(datos, pareja)
    ok(!aBase64(sobre).includes(aBase64(datos)))
  })

  test('la llave de otra pareja falla en vez de devolver basura', async () => {
    const sobre = await cifrarConPareja(bytesAlAzar(64), generarLlaveDePareja())
    await rejects(() => descifrarConPareja(sobre, generarLlaveDePareja()))
  })

  test('cada sobre trae su propio id de derivación, así que no comparten llave', async () => {
    const pareja = generarLlaveDePareja()
    const uno = await cifrarConPareja(bytesAlAzar(64), pareja)
    const otro = await cifrarConPareja(bytesAlAzar(64), pareja)
    // Los 16 bytes que siguen a la versión son el id: si se repitieran, dos
    // archivos compartirían llave y el IV al azar dejaría de ser seguro.
    notStrictEqual(aBase64(uno.subarray(1, 17)), aBase64(otro.subarray(1, 17)))
  })

  test('alterar un solo bit del sobre lo hace fallar', async () => {
    const pareja = generarLlaveDePareja()
    const sobre = await cifrarConPareja(bytesAlAzar(64), pareja)
    // Incluido un byte del id: alterarlo deriva otra llave, y el tag lo caza.
    for (const i of [1, 5, 20, 30, sobre.length - 1]) {
      const roto = Uint8Array.from(sobre)
      roto[i] ^= 1
      await rejects(() => descifrarConPareja(roto, pareja), `el byte ${i} pasó sin detectarse`)
    }
  })

  test('un sobre cortado o de versión desconocida se rechaza sin romperse', async () => {
    const pareja = generarLlaveDePareja()
    const sobre = await cifrarConPareja(bytesAlAzar(64), pareja)
    await rejects(() => descifrarConPareja(sobre.subarray(0, 8), pareja), /incompleto/)
    const futuro = Uint8Array.from(sobre)
    futuro[0] = 99
    await rejects(() => descifrarConPareja(futuro, pareja), /desconocida/)
  })

  test('los dos formatos no se confunden entre sí', async () => {
    // El sobre de envolver llaves y el de archivos llevan versiones distintas
    // justamente para que mezclarlos falle de entrada.
    const pareja = generarLlaveDePareja()
    const deArchivo = await cifrarConPareja(bytesAlAzar(32), pareja)
    const envoltura = await derivarEnvoltura('x', generarSalt(), KDF_RAPIDO)
    await rejects(() => descifrar(deArchivo, envoltura), /desconocida/)
    const deLlave = await envolverLlave(pareja, envoltura)
    await rejects(() => descifrarConPareja(deLlave, pareja), /desconocida/)
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
    const sobre = await cifrarConPareja(bytesAlAzar(64), pareja)
    const salt = generarSalt()
    const nueva = await envolverLlave(pareja, await derivarEnvoltura('frase nueva', salt, KDF_RAPIDO))
    const recuperada = await abrirLlave(nueva, await derivarEnvoltura('frase nueva', salt, KDF_RAPIDO))
    // La foto de antes sigue abriéndose, que es el punto de no derivar la
    // llave de pareja desde la frase.
    ok(await descifrarConPareja(sobre, recuperada))
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
