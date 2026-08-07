import type { ClaveTexto, FuncionT } from './index'

/** The server (and a couple of client-side fallbacks) always answers in
 * Spanish — that didn't change, and touching 67 response sites on a server
 * with one real couple's data behind it wasn't worth the risk for this.
 * This is the other side: a lookup from the exact Spanish text back to a
 * dictionary key, so a *recognised* message shows in whatever language is
 * active. Anything unrecognised — a message this table doesn't know about,
 * a network error, a browser's own wording — is shown as-is. That's Spanish
 * more often than not, which is honest: better than a blank, and better than
 * guessing at a translation for text this table has never seen. */

const ESTATICAS: { mensaje: string; clave: ClaveTexto }[] = [
  { mensaje: 'Algunas fotos expiraron, volvé a agregarlas', clave: 'err_fotos_expiraron' },
  { mensaje: 'El nombre no puede quedar vacío', clave: 'err_nombre_vacio' },
  { mensaje: 'Error interno', clave: 'err_interno' },
  { mensaje: 'Esa foto ya no está disponible, probá de nuevo', clave: 'err_foto_no_disponible' },
  { mensaje: 'Esa imagen no es válida', clave: 'err_imagen_invalida' },
  { mensaje: 'Esa pareja ya está completa', clave: 'err_pareja_completa' },
  { mensaje: 'Escribí una idea', clave: 'err_escribi_idea' },
  { mensaje: 'Ese código no existe', clave: 'err_codigo_no_existe' },
  { mensaje: 'Ese enlace no se puede abrir desde acá', clave: 'err_enlace_no_abre' },
  { mensaje: 'Falta el código', clave: 'err_falta_codigo' },
  { mensaje: 'Falta el fondo', clave: 'err_falta_fondo' },
  { mensaje: 'Falta el orden', clave: 'err_falta_orden' },
  { mensaje: 'Falta la foto', clave: 'err_falta_foto' },
  { mensaje: 'Falta tu nombre', clave: 'err_falta_nombre' },
  { mensaje: 'Fecha inválida', clave: 'err_fecha_invalida' },
  { mensaje: 'Hito inválido', clave: 'err_hito_invalido' },
  { mensaje: 'Las fotos llegaron incompletas', clave: 'err_fotos_incompletas' },
  { mensaje: 'No encontramos esa categoría', clave: 'err_no_encontramos_categoria' },
  { mensaje: 'No encontramos esa foto', clave: 'err_no_encontramos_foto' },
  { mensaje: 'No encontramos esa idea', clave: 'err_no_encontramos_idea' },
  { mensaje: 'No encontramos ese recuerdo', clave: 'err_no_encontramos_recuerdo' },
  { mensaje: 'No encontramos ninguna imagen en ese enlace', clave: 'err_no_encontramos_imagen_enlace' },
  { mensaje: 'No hay nada que cambiar', clave: 'err_nada_que_cambiar' },
  { mensaje: 'No pudimos descargar esa imagen', clave: 'err_no_pudimos_descargar_imagen' },
  { mensaje: 'No pudimos leer ese enlace', clave: 'err_no_pudimos_leer_enlace' },
  { mensaje: 'Todavía no estás en una pareja', clave: 'err_sin_pareja' },
  { mensaje: 'Ya estás en una pareja', clave: 'err_ya_en_pareja' },
  { mensaje: 'Alguna de las fotos es demasiado pesada', clave: 'err_foto_muy_pesada' },
  { mensaje: 'No pudimos procesar las fotos', clave: 'err_no_procesamos_fotos' },
  { mensaje: 'El worker de fotos falló', clave: 'err_worker_fallo' },
  { mensaje: 'No se pudo procesar la imagen', clave: 'err_no_procesamos_imagen' },
  // Fallbacks that already have a home elsewhere in the dictionary.
  { mensaje: 'Algo salió mal', clave: 'comun_algo_salio_mal' },
  { mensaje: 'No pudimos abrir ese enlace', clave: 'app_error_enlace' },
]

/** Messages with a number baked in by the server — a cap, a length limit.
 * The number is read out of the Spanish text rather than duplicated here,
 * so a constant changing on the server (MAX_FOTOS, MAX_IDEAS...) doesn't
 * need a matching change on the client to stay accurate. */
const DINAMICAS: { patron: RegExp; clave: ClaveTexto }[] = [
  { patron: /^La idea no puede pasar de (\d+) caracteres$/, clave: 'err_idea_muy_larga' },
  { patron: /^La ruleta llega hasta (\d+) ideas$/, clave: 'err_ruleta_llena' },
  { patron: /^No podés guardar más de (\d+) referencias$/, clave: 'err_max_referencias' },
  { patron: /^No podés tener más de (\d+) categorías$/, clave: 'err_max_carpetas' },
  { patron: /^Poné un nombre de hasta (\d+) caracteres$/, clave: 'err_nombre_carpeta_largo' },
  { patron: /^No podés subir más de (\d+) fotos por recuerdo$/, clave: 'err_max_fotos' },
]

/** `t`'s real type ties each key to its own argument list, which is exactly
 * right for call sites that know the key ahead of time. This table doesn't —
 * it discovers the key at runtime — so the call is made through a narrower,
 * locally-cast signature rather than losing that precision everywhere else. */
function llamarT(t: FuncionT, clave: ClaveTexto, args: number[]): string {
  return (t as unknown as (c: ClaveTexto, ...a: number[]) => string)(clave, ...args)
}

export function traducirError(mensaje: string, t: FuncionT): string {
  for (const regla of ESTATICAS) {
    if (regla.mensaje === mensaje) return llamarT(t, regla.clave, [])
  }
  for (const regla of DINAMICAS) {
    const coincide = regla.patron.exec(mensaje)
    if (coincide) return llamarT(t, regla.clave, [Number(coincide[1])])
  }
  return mensaje
}
