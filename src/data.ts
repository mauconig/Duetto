import type { Album, Articulo } from './types'

export const nombres = 'Sofía & Andrés'
export const fechaAniversario = '2024-02-14'
export const proximoHito: 'cumplemes' | 'aniversario' = 'cumplemes'

export const ideasIniciales = [
  'Picnic al atardecer',
  'Noche de cocina italiana',
  'Cine en casa',
  'Ruta de cafés nuevos',
  'Museo sorpresa',
  'Caminata al amanecer',
]

export const albumes: Album[] = [
  { id: 'primer-cita', fecha: '2024-02-14', fotos: 1, fondo: 'linear-gradient(135deg, #cf6a78, #a32f42)' },
  { id: 'feria-libro', fecha: '2024-05-03', fotos: 0, fondo: 'linear-gradient(135deg, #a8465c, #6d1f30)' },
  { id: 'un-anio', fecha: '2025-02-14', fotos: 3, fondo: 'linear-gradient(135deg, #e0a08a, #c26550)' },
  {
    id: 'costa',
    fecha: '2025-10-10',
    fechaFin: '2025-10-12',
    fotos: 5,
    fondo: 'linear-gradient(135deg, #d98b78, #b0503c)',
  },
  { id: 'casa', fecha: '2026-07-18', fotos: 2, fondo: 'linear-gradient(135deg, #a8465c, #6d1f30)' },
]

export const articulos: Articulo[] = [
  {
    id: 'rituales',
    tag: 'Rituales',
    titulo: 'Rituales pequeños, vínculos grandes',
    min: 6,
    resumen: 'Por qué un café de los domingos pesa más que un gran viaje al año.',
    cuerpo: [
      'Las parejas que duran no suelen recordar los gestos grandes: recuerdan los repetidos. Un café juntos los domingos, la misma canción al cocinar, la pregunta de cada noche. Los rituales funcionan porque son previsibles: no dependen del ánimo ni del calendario.',
      'Para crear uno, conviene empezar por algo que ya ocurre y darle nombre. Si siempre caminan después de cenar, llamarlo "la vuelta" lo convierte en algo de los dos. El nombre protege el hábito: es más difícil cancelar algo que tiene identidad.',
      'Un ritual no necesita durar más de diez minutos. Necesita repetirse. Elijan uno esta semana, pónganle nombre y defiéndanlo del resto de la agenda.',
    ],
  },
  {
    id: 'dinero',
    tag: 'Comunicación',
    titulo: 'Cómo hablar de dinero sin pelear',
    min: 8,
    resumen: 'Una conversación mensual de veinte minutos evita la mayoría de los conflictos.',
    cuerpo: [
      'El dinero es la primera causa de discusión en parejas, y casi nunca por las cifras: es por lo que el dinero significa para cada uno. Para una persona ahorrar es seguridad; para la otra, gastar en experiencias es vivir. Ninguna de las dos está equivocada.',
      'La herramienta más simple es una reunión mensual corta, con fecha fija y fuera de cualquier discusión. Veinte minutos: qué entró, qué salió, qué viene. Hablar de dinero cuando no hay problema hace posible hablar cuando lo hay.',
      'Acuerden también un monto libre para cada uno, sin explicaciones. La autonomía pequeña evita la auditoría constante, que es lo que realmente desgasta.',
    ],
  },
  {
    id: 'tiempo-calidad',
    tag: 'Tiempo juntos',
    titulo: 'El lenguaje del tiempo de calidad',
    min: 5,
    resumen: 'Estar en la misma habitación no es lo mismo que estar juntos.',
    cuerpo: [
      'Compartir sofá mirando pantallas distintas es compañía, no tiempo de calidad. La diferencia no es la actividad sino la atención: tiempo de calidad es cualquier rato en el que la otra persona tiene tu atención completa.',
      'No hace falta agendar salidas elaboradas. Quince minutos de conversación sin teléfonos rinden más que una cena larga mirando notificaciones. La regla práctica: si pueden reconstruir lo que dijo el otro, fue tiempo de calidad.',
    ],
  },
  {
    id: 'discutir-bien',
    tag: 'Conflicto',
    titulo: 'Discutir bien: una guía práctica',
    min: 7,
    resumen: 'Las parejas sólidas no discuten menos: discuten mejor.',
    cuerpo: [
      'Discutir no es señal de que algo anda mal; es señal de que hay dos personas reales. Lo que predice problemas no es la frecuencia de las discusiones sino su forma: el desprecio, la ironía y el silencio castigador dañan más que cualquier grito.',
      'Dos reglas cambian casi todo. Primero, hablar del hecho y no del carácter: "llegaste tarde hoy" en lugar de "siempre llegas tarde". Segundo, pedir pausa cuando la conversación se acelera, con hora de regreso: "sigamos a las ocho" no es huir, es cuidar.',
      'Y al cerrar, cerrar de verdad: qué acordamos, qué hace cada uno distinto. Una discusión que termina en acuerdo concreto no vuelve a abrirse igual.',
    ],
  },
]
