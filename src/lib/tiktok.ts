/** TikToks on the moodboard.
 *
 * TikTok gives no picture to save — its oEmbed dropped the thumbnail, and its
 * pages turn automated readers away — so a TikTok is saved as a card this
 * draws, and plays through TikTok's own embed player when opened. The card
 * is an ordinary image to the rest of the app: it's resized, encrypted,
 * stored and counted like any photo, and `urlOrigen` is what marks it as a
 * TikTok. */

/** The id in a post's address, `/@user/video/7301234567890123456`. The
 * server always saves that canonical form, so a short link never gets here. */
export function idDeTikTok(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url)
    if (hostname !== 'tiktok.com' && !hostname.endsWith('.tiktok.com')) return null
    return /\/(?:video|photo)\/(\d{8,25})\/?$/.exec(pathname)?.[1] ?? null
  } catch {
    return null
  }
}

/** TikTok's Embed Player. Muted autoplay is the only autoplay browsers allow;
 * the player's own controls unmute it. */
export function urlReproductorTikTok(id: string): string {
  return `https://www.tiktok.com/player/v1/${id}?autoplay=1&muted=1&rel=0&description=1`
}

const ANCHO = 720
const ALTO = 1280

/** TikTok's note, the same path the lightbox badge uses, on a 24-unit box. */
const LOGO =
  'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z'

/** Splits text into at most `maxLineas` lines that fit `ancho`, ending the
 * last one with an ellipsis when the caption runs longer. */
function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, maxLineas: number): string[] {
  const palabras = texto.replace(/\s+/g, ' ').trim().split(' ')
  const salida: string[] = []
  let linea = ''
  for (const palabra of palabras) {
    const prueba = linea ? `${linea} ${palabra}` : palabra
    if (ctx.measureText(prueba).width <= ancho || !linea) {
      linea = prueba
      continue
    }
    salida.push(linea)
    linea = palabra
    if (salida.length === maxLineas) break
  }
  if (salida.length < maxLineas && linea) salida.push(linea)
  const recortado = salida.length === maxLineas && salida.join(' ').length < texto.replace(/\s+/g, ' ').trim().length
  if (recortado) {
    let ultima = salida[maxLineas - 1]
    while (ultima && ctx.measureText(`${ultima}…`).width > ancho) ultima = ultima.slice(0, -1)
    salida[maxLineas - 1] = `${ultima.trimEnd()}…`
  }
  return salida
}

/** The moodboard tile for a TikTok: black, with TikTok's cyan and red glow,
 * the logo, and the caption and author when oEmbed still gave them. */
export async function tarjetaTikTok(datos: { titulo: string | null; autor: string | null }): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO
  canvas.height = ALTO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ANCHO, ALTO)
  for (const [x, y, color] of [
    [ANCHO * 0.15, ALTO * 0.2, 'rgba(37, 244, 238, 0.28)'],
    [ANCHO * 0.9, ALTO * 0.8, 'rgba(254, 44, 85, 0.28)'],
  ] as const) {
    const brillo = ctx.createRadialGradient(x, y, 0, x, y, ANCHO * 0.75)
    brillo.addColorStop(0, color)
    brillo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = brillo
    ctx.fillRect(0, 0, ANCHO, ALTO)
  }

  // The logo, with TikTok's offset cyan and red copies behind it.
  const escala = 9
  const logo = new Path2D(LOGO)
  const lx = (ANCHO - 24 * escala) / 2
  const ly = ALTO * 0.36 - 12 * escala
  for (const [dx, dy, color] of [
    [-5, -5, '#25F4EE'],
    [5, 5, '#FE2C55'],
    [0, 0, '#fff'],
  ] as const) {
    ctx.save()
    ctx.translate(lx + dx, ly + dy)
    ctx.scale(escala, escala)
    ctx.fillStyle = color
    ctx.fill(logo)
    ctx.restore()
  }

  // Play mark under the logo, so the tile reads as "this plays".
  const cx = ANCHO / 2
  const cy = ALTO * 0.6
  ctx.beginPath()
  ctx.arc(cx, cy, 54, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - 16, cy - 26)
  ctx.lineTo(cx + 28, cy)
  ctx.lineTo(cx - 16, cy + 26)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.fill()

  const fuente = "'Quicksand', system-ui, sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  let y = ALTO * 0.74
  if (datos.titulo) {
    ctx.font = `600 40px ${fuente}`
    ctx.fillStyle = '#fff'
    for (const linea of lineas(ctx, datos.titulo, ANCHO - 120, 3)) {
      ctx.fillText(linea, ANCHO / 2, y)
      y += 54
    }
    y += 10
  }
  if (datos.autor) {
    ctx.font = `700 34px ${fuente}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.fillText(`@${datos.autor.replace(/^@/, '')}`, ANCHO / 2, y)
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return new File([blob], 'tiktok.png', { type: 'image/png' })
}
