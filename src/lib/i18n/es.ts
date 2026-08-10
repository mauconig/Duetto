/** Every piece of text the app shows, in Spanish. The source of truth: `en`
 * and `pt` are typed as `Diccionario` (see `./index.ts`), so a key missing
 * there — or a function with the wrong parameters — is a compile error, not
 * a silent gap that ships as Spanish to an English reader.
 *
 * Values are plain strings, or functions for anything with a count or a name
 * baked in: word order and pluralization differ per language, so the whole
 * sentence is written per locale rather than assembled from fragments. */
export const es = {
  // Común, repetido entre pantallas
  comun_cerrar: 'Cerrar',
  comun_volver: 'Volver',
  comun_cancelar: 'Cancelar',
  comun_guardar: 'Guardar',
  comun_guardando: 'Guardando...',
  comun_guardar_cambios: 'Guardar cambios',
  comun_continuar: 'Continuar',
  comun_un_momento: 'Un momento...',
  comun_copiar: 'Copiar',
  comun_copiado: '¡Copiado!',
  comun_borrar: 'Borrar',
  comun_renombrar: 'Renombrar',
  comun_nombre: 'Nombre',
  comun_fecha: 'Fecha',
  comun_fecha_placeholder: 'AAAA-MM-DD',
  comun_fotos: 'Fotos',
  comun_foto_placeholder: 'Foto',
  imageslot_ver_foto: 'Ver foto',
  comun_algo_salio_mal: 'Algo salió mal',
  comun_politica_privacidad: 'Política de Privacidad',
  comun_tema_auto: 'Auto',
  comun_tema_claro: 'Claro',
  comun_tema_oscuro: 'Oscuro',

  // Bienvenida
  bienvenida_subtitulo: 'El álbum, los planes y los recuerdos de los dos, en un solo lugar.',
  bienvenida_punto_album: 'Álbumes que llenan los dos',
  bienvenida_punto_ruleta: 'Una ruleta que decide la cita',
  bienvenida_punto_tiempo: 'El tiempo juntos, contado al día',
  bienvenida_crear_cuenta: 'Crear nuestra cuenta',
  bienvenida_iniciar_sesion: 'Ya tengo cuenta',
  // En dos claves porque el enlace va en el medio y el orden de las palabras
  // cambia por idioma; `t()` devuelve string, así que el <a> se arma en el JSX.
  bienvenida_legal_previo: 'Al continuar aceptás la',
  bienvenida_legal_privacidad: 'política de privacidad',

  // Onboarding
  onboarding_nombre_titulo: '¿Cómo te llamás?',
  onboarding_nombre_subtitulo: 'Así sabemos cómo saludarte cada día.',
  onboarding_nombre_placeholder: 'Tu nombre',
  onboarding_consentimiento_pre: 'Leí y acepto la',
  onboarding_consentimiento_post: ', incluido que mis fotos se guardan en un servidor en Estados Unidos.',
  onboarding_vincular_titulo: 'Conectá con tu pareja',
  onboarding_vincular_subtitulo:
    'Pictogether se comparte de a dos: uno crea un código y el otro lo usa para entrar.',
  onboarding_crear_codigo_titulo: 'Crear un código',
  onboarding_crear_codigo_desc: 'Generá uno y compartíselo a tu pareja.',
  onboarding_tengo_codigo_titulo: 'Ya tengo un código',
  onboarding_tengo_codigo_desc: 'Tu pareja ya creó el suyo y te lo pasó.',
  onboarding_codigo_titulo: 'Este es su código',
  onboarding_codigo_subtitulo: 'Pasáselo a tu pareja para que lo ingrese. Podés seguir usando la app mientras tanto.',
  onboarding_ingresar_titulo: 'Ingresá el código',
  onboarding_ingresar_subtitulo: 'El que te pasó tu pareja.',
  onboarding_fecha_titulo: '¿Cuándo empezaron?',
  onboarding_fecha_subtitulo: 'Desde esta fecha contamos el tiempo juntos.',
  onboarding_hito_titulo: '¿Qué querés ver primero?',
  onboarding_hito_subtitulo: 'El hito que Pictogether les va a mostrar en la pantalla de inicio.',
  onboarding_empezar: 'Empezar',
  onboarding_no_se_pudo_copiar: 'No se pudo copiar. Anotalo a mano.',

  // Hito: aniversario / cumplemés, compartido entre Onboarding y Ajustes
  hito_opcion_aniversario_titulo: 'Próximo aniversario',
  hito_opcion_aniversario_desc: 'Una vez al año, la fecha en que empezaron.',
  hito_opcion_cumplemes_titulo: 'Próximo cumplemés',
  hito_opcion_cumplemes_desc: 'Todos los meses, el mismo día del mes.',
  hito_titulo_aniversario: (n: number) => `Aniversario n.º ${n}`,
  hito_titulo_cumplemes: (n: number) => `Cumplemes n.º ${n}`,
  // `: string` matters here and only here: both branches are plain string
  // literals, so without it TypeScript would infer 'día' | 'días' — a type
  // `en`/`pt` could never satisfy with their own words.
  hito_dias_unidad: (n: number): string => (n === 1 ? 'día' : 'días'),

  // Navegación / títulos de pantalla compartidos
  nav_inicio: 'Inicio',
  nav_recuerdos: 'Recuerdos',
  nav_ruleta: 'Ruleta',
  nav_inspiracion: 'Moodboard',
  nav_perfil: 'Perfil',

  // Recuerdos (Albums)
  recuerdos_vacio_titulo: 'Todavía no hay recuerdos',
  recuerdos_vacio_texto: 'Tocá el botón + y guardá su primer momento juntos. Lo que suban lo van a ver los dos.',

  // Ruleta
  ruleta_titulo: 'Ruleta de citas',
  ruleta_subtitulo: 'Sus ideas deciden la próxima cita',
  ruleta_girando: 'Girando…',
  ruleta_girar: 'Girar la ruleta',
  ruleta_resultado_kicker: 'Esta vez toca',
  ruleta_ideas_en_juego: (n: number) => `IDEAS EN JUEGO · ${n}`,
  ruleta_borrar_idea_aria: (texto: string) => `Borrar ${texto}`,
  ruleta_idea_placeholder: 'Nueva idea de cita',
  ruleta_nota: 'Lo que agreguen acá lo ven los dos.',
  ruleta_error_guardar_idea: 'No pudimos guardar la idea',
  ruleta_error_borrar_idea: 'No pudimos borrar la idea',

  // Inicio (Home)
  inicio_saludo: (nombres: string) => `Hola, ${nombres}`,
  inicio_juntos_desde: (fecha: string) => `Juntos desde el ${fecha}`,
  inicio_unidad_anios: 'años',
  inicio_unidad_meses: 'meses',
  inicio_unidad_dias: 'días',
  inicio_es_hoy: '¡Es hoy!',
  inicio_proximo_hito: 'Próximo hito',
  inicio_ultimo_recuerdo: 'Último recuerdo',
  inicio_sumar_primer_recuerdo: 'Sumá su primer recuerdo',
  inicio_insp_guardadas: (n: number) => (n === 1 ? '1 guardada' : `${n} guardadas`),
  inicio_insp_vacio_titulo: 'Guardá fotos que quieran copiar',
  inicio_insp_vacio_texto: 'Todavía no hay ninguna',
  inicio_recuerdo_del_dia: 'Recuerdo del día',
  inicio_idea_kicker: 'Idea para la próxima cita',

  // Inspiración
  insp_subtitulo: 'Fotos que quieren copiar, guardadas de a dos',
  insp_tab_todas: 'Todas',
  insp_nueva_carpeta: 'Nueva carpeta',
  insp_editar: 'Editar',
  insp_listo: 'Listo',
  insp_borrar_carpeta_hint: 'Borrar una carpeta no borra sus fotos: quedan sueltas.',
  insp_fotos_sin_carpeta: (n: number) =>
    n === 1 ? 'Hay 1 foto sin carpeta. Tocá una para archivarla.' : `Hay ${n} fotos sin carpeta. Tocá una para archivarla.`,
  insp_subiendo: (n: number) => `Subiendo ${n}...`,
  insp_vacio_titulo: 'Todavía no hay nada acá',
  insp_vacio_texto: 'Guardá fotos que les gusten con el botón +, desde la galería o pegando el link de un pin.',
  insp_renombrar_carpeta_titulo: 'Renombrar carpeta',
  insp_nombre_placeholder: 'Poses, Historias, Viajes...',
  insp_archivar_en: 'Archivar en',
  insp_sin_carpetas: 'Todavía no creaste ninguna carpeta.',
  insp_sacar_de_carpeta: 'Sacar de la carpeta',
  insp_archivar: 'Archivar',
  insp_error_crear_carpeta: 'No pudimos crear la carpeta',
  insp_ver_en_pinterest: 'Ver en Pinterest',
  insp_agregar_titulo: '¿De dónde la traemos?',
  insp_desde_galeria: 'Elegir de la galería',
  insp_desde_galeria_hint: 'Fotos guardadas en el teléfono',
  insp_desde_enlace: 'Pegar el link de un pin',
  insp_desde_enlace_hint: 'Copiado desde Pinterest',
  insp_enlace_titulo: 'Pegar un link',
  insp_enlace_campo: 'Link del pin',
  insp_enlace_pegar: 'Pegar',
  insp_enlace_buscar: 'Traer la imagen',
  insp_enlace_buscando: 'Buscando la imagen…',
  // Written for iPhone, where sharing into the app isn't possible and this is
  // the only way in. Names the menu item literally so it can be followed
  // without knowing what a link is.
  insp_enlace_ayuda: 'En Pinterest, tocá el pin, después Compartir y Copiar enlace. Volvé acá y pegalo.',

  // Celebración
  celebracion_texto: (nombres: string) => `Hoy es el día, ${nombres}.`,
  celebracion_boton: 'Festejar',

  // Recortar foto de perfil
  recorte_titulo: 'Elegí qué se ve',
  recorte_error_abrir: 'No pudimos abrir esa imagen',
  recorte_acercar: 'Acercar',
  recorte_ayuda: 'Arrastrá para mover, o pellizcá para acercar.',
  recorte_error_preparar: 'No pudimos preparar la imagen',
  recorte_error_recortar: 'No pudimos recortar la imagen',
  recorte_usar_foto: 'Usar esta foto',

  // Perfil
  perfil_cambiar_foto: 'Cambiar tu foto',
  perfil_poner_foto: 'Poner tu foto',
  perfil_quitar_foto: 'Quitar mi foto',
  perfil_error_cambiar_foto: 'No pudimos cambiar la foto',
  perfil_error_quitar_foto: 'No pudimos quitar la foto',
  perfil_dias_juntos: 'días juntos',
  perfil_stat_recuerdos: 'recuerdos',
  perfil_stat_ideas: 'ideas de cita',
  perfil_tu_nombre: 'Tu nombre',
  perfil_fecha_aniversario: 'Fecha de aniversario',
  perfil_pareja_vinculada: 'Pareja vinculada',
  perfil_espacio: 'Espacio usado',
  perfil_espacio_valor: (usado: string, limite: string) => `${usado} de ${limite}`,
  perfil_premium: 'Premium',
  perfil_invitar_pareja: 'Invitar a tu pareja',
  perfil_apariencia: 'Apariencia',
  perfil_idioma: 'Idioma',
  perfil_idioma_es: 'Español',
  perfil_idioma_en: 'English',
  perfil_idioma_pt: 'Português',
  perfil_desvincularme: 'Desvincularme de la pareja',
  perfil_cerrar_sesion: 'Cerrar sesión',

  // Ajustes (SettingsSheet)
  ajustes_titulo: 'Ajustes',
  ajustes_fecha_hint: 'Cambia para los dos.',
  ajustes_proximo_hito: 'Próximo hito',
  ajustes_error: 'No pudimos guardar los cambios',

  // Desvincularse (LeaveCoupleSheet)
  salir_pareja_generica: 'tu pareja',
  salir_error: 'No pudimos desvincularte',
  salir_titulo: 'Desvincularte',
  salir_texto_vinculada: (pareja: string) =>
    `Vas a salir de la pareja con ${pareja}. Dejás de ver los recuerdos, las fotos y las ideas compartidas — ${pareja} los conserva. Si querés volver, te alcanza con entrar de nuevo con el mismo código.`,
  salir_texto_sola:
    'Todavía no se unió nadie a tu código, así que no queda nadie para guardar lo que subiste: se borran todos tus recuerdos, sus fotos y las ideas de la ruleta. No se puede deshacer.',
  salir_saliendo: 'Saliendo...',
  salir_confirmar: 'Sí, desvincularme',

  // Lightbox
  lightbox_editar_recuerdo: 'Editar recuerdo',
  lightbox_foto_anterior: 'Foto anterior',
  lightbox_foto_siguiente: 'Foto siguiente',

  // Recuerdo (EntrySheet)
  recuerdo_error_borrar: 'No pudimos borrar el recuerdo',
  recuerdo_error_guardar: 'No pudimos guardar el recuerdo',
  recuerdo_nuevo_titulo: 'Nuevo recuerdo',
  recuerdo_fecha_detectada: 'Detectada de tus fotos',
  recuerdo_fecha_no_encontrada: 'No se pudo encontrar la fecha en las fotos',
  recuerdo_rango_checkbox: 'Fue un rango de fechas (viaje de varios días)',
  recuerdo_hasta: 'Hasta',
  recuerdo_nota_label: 'Nota (opcional)',
  recuerdo_nota_placeholder: 'Un par de palabras sobre este recuerdo...',
  recuerdo_quitar_foto: 'Quitar foto',
  recuerdo_mover_antes: 'Mover antes',
  recuerdo_mover_despues: 'Mover después',
  recuerdo_agregar_fotos: 'Agregar fotos',
  recuerdo_subiendo_progreso: (listas: number, total: number) => `Subiendo ${listas} de ${total}...`,
  recuerdo_fotos_fallidas: (n: number) =>
    n === 1 ? 'Una foto no subió; se reintentan al guardar.' : `${n} fotos no subieron; se reintentan al guardar.`,
  recuerdo_subiendo_fotos: 'Subiendo fotos...',
  recuerdo_guardar_nuevo: 'Guardar recuerdo',
  recuerdo_confirmar_borrado: (n: number) =>
    n === 1 ? 'Se borra para los dos, con su foto. No se puede deshacer.' : `Se borra para los dos, con sus ${n} fotos. No se puede deshacer.`,
  recuerdo_borrando: 'Borrando...',
  recuerdo_confirmar_si: 'Sí, borrar',
  recuerdo_borrar_boton: 'Borrar recuerdo',

  // Compartir (SharedPhotosSheet)
  compartir_que_carpeta: '¿En qué carpeta?',
  compartir_nombre_carpeta_placeholder: 'Nombre de la carpeta',
  compartir_creando: 'Creando…',
  compartir_crear_y_guardar: 'Crear y guardar',
  compartir_sin_carpeta: 'Sin carpeta',
  compartir_cuantas: (n: number) => (n === 1 ? 'Llegó 1 foto' : `Llegaron ${n} fotos`),
  compartir_descartar: 'Descartar',
  compartir_donde_guardamos: '¿Dónde las guardamos?',
  compartir_en_recuerdo_nuevo: 'En un recuerdo nuevo',
  compartir_en_inspiracion: 'En el moodboard',
  compartir_para_copiar_mas_adelante: 'Para copiarla más adelante',
  compartir_o_sumalas: 'o sumalas a uno que ya existe',
  compartir_sin_nota: 'Sin nota',

  // App: pantallas de carga, error general, enlaces compartidos
  app_reintentar: 'Reintentar',
  app_error_conectar: 'No pudimos conectar',
  app_nombre_generico: 'Vos',
  app_error_enlace: 'No pudimos abrir ese enlace',
  app_error_cargar_inspiracion: 'No pudimos cargar el moodboard',
  app_error_guardar_foto: 'No pudimos guardar la foto',
  app_entendido: 'Entendido',
  app_buscando_imagen: 'Buscando la imagen…',

  // Traducciones de lo que contesta el servidor. El servidor sigue
  // respondiendo en español — ver erroresServidor.ts — así que estas claves
  // existen para que un mensaje reconocido se muestre en el idioma de quien
  // lo está leyendo en vez de quedar siempre en español.
  err_fotos_expiraron: 'Algunas fotos expiraron, volvé a agregarlas',
  err_nombre_vacio: 'El nombre no puede quedar vacío',
  err_interno: 'Error interno',
  err_foto_no_disponible: 'Esa foto ya no está disponible, probá de nuevo',
  err_imagen_invalida: 'Esa imagen no es válida',
  err_pareja_completa: 'Esa pareja ya está completa',
  err_escribi_idea: 'Escribí una idea',
  err_codigo_no_existe: 'Ese código no existe',
  err_enlace_no_abre: 'Ese enlace no se puede abrir desde acá',
  err_falta_codigo: 'Falta el código',
  err_falta_fondo: 'Falta el fondo',
  err_falta_orden: 'Falta el orden',
  err_falta_foto: 'Falta la foto',
  err_falta_nombre: 'Falta tu nombre',
  err_fecha_invalida: 'Fecha inválida',
  err_hito_invalido: 'Hito inválido',
  err_fotos_incompletas: 'Las fotos llegaron incompletas',
  err_no_encontramos_categoria: 'No encontramos esa categoría',
  err_no_encontramos_foto: 'No encontramos esa foto',
  err_no_encontramos_idea: 'No encontramos esa idea',
  err_no_encontramos_recuerdo: 'No encontramos ese recuerdo',
  err_no_encontramos_imagen_enlace: 'No encontramos ninguna imagen en ese enlace',
  err_nada_que_cambiar: 'No hay nada que cambiar',
  err_no_pudimos_descargar_imagen: 'No pudimos descargar esa imagen',
  err_no_pudimos_leer_enlace: 'No pudimos leer ese enlace',
  err_sin_pareja: 'Todavía no estás en una pareja',
  err_ya_en_pareja: 'Ya estás en una pareja',
  err_idea_muy_larga: (n: number) => `La idea no puede pasar de ${n} caracteres`,
  err_ruleta_llena: (n: number) => `La ruleta llega hasta ${n} ideas`,
  err_max_referencias: (n: number) => `No podés guardar más de ${n} referencias`,
  err_max_carpetas: (n: number) => `No podés tener más de ${n} categorías`,
  err_nombre_carpeta_largo: (n: number) => `Poné un nombre de hasta ${n} caracteres`,
  err_max_fotos: (n: number) => `No podés subir más de ${n} fotos por recuerdo`,
  err_foto_muy_pesada: 'Alguna de las fotos es demasiado pesada',
  err_no_procesamos_fotos: 'No pudimos procesar las fotos',
  err_worker_fallo: 'El worker de fotos falló',
  err_no_procesamos_imagen: 'No se pudo procesar la imagen',
}
