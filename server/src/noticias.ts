import { randomUUID } from 'node:crypto'
import { db } from './db.ts'

/** Nothing on the card is longer than this anyway, and it keeps a feed that
 * puts a whole article in <description> from filling the database. It is also
 * the line between quoting a source and republishing it. */
const LARGO_RESUMEN = 220

/** The pool is read whole by the client and picked from once a day. Past this
 * the oldest go — the only thing that bounds the table, since nothing here
 * expires by date.
 *
 * Nothing expires because none of this is news. "How to argue better" is as
 * useful two years after it was written as the week it went up, and the card
 * never shows a date, so nothing about an older piece reads as stale. It also
 * isn't optional: an expiry window shorter than the age of what these feeds
 * carry deletes an article and then re-inserts it on the next pass, forever.
 * The first version of this had a 120-day window against a feed whose newest
 * piece was 141 days old, and the pool it produced was four articles. */
const MAX_ARTICULOS = 300

/** Every few hours is far more often than these feeds publish; the point is
 * not to miss anything, not to be quick. */
const HORAS_ENTRE_PASADAS = 6

const UA = 'Pictogether/1.0 (lector de feeds)'

/** Where the articles come from.
 *
 * `filtrar` is the whole difference between a reader and a curator. A feed
 * that is about couples end to end is taken whole. A general psychology feed
 * is worth reading but mostly isn't about couples, so only what matches gets
 * in.
 *
 * General *news* feeds were tried and dropped: El País and BBC Mundo matched
 * the same keywords on pieces about a French couple's house and a fashion
 * label, so the filter's precision there was worse than useless. Every source
 * below is a psychology or relationships site, which is what makes a match on
 * "pareja" mean what it looks like it means. */
interface Fuente {
  nombre: string
  url: string
  filtrar: boolean
}

const FUENTES: Fuente[] = [
  // The site's own "relaciones" section, taken whole — somebody there already
  // decided these pieces are about relationships, which is the judgement a
  // keyword list is a poor substitute for. It publishes in bursts, so most of
  // the time this contributes nothing new.
  { nombre: 'La Mente es Maravillosa', url: 'https://lamenteesmaravillosa.com/category/relaciones/feed/', filtrar: false },
  // Same site's main feed, which is fresh but is skincare and meditation as
  // often as anything else. Filtered, it's the trickle that keeps the pool
  // growing between bursts.
  { nombre: 'La Mente es Maravillosa', url: 'https://lamenteesmaravillosa.com/feed/', filtrar: true },
  { nombre: 'Siquia', url: 'https://www.siquia.com/feed/', filtrar: true },
  { nombre: 'Psicología y Mente', url: 'https://psicologiaymente.com/feed', filtrar: true },
]

// Bekia Pareja was in this list and came out. It is nominally about couples
// and it publishes constantly, which made it two thirds of the pool — but
// what it publishes is a content farm: vibrator reviews, "how to find a
// partner", viral trends. Two or three of its thirteen pieces were worth
// reading. Volume from a source like that is worse than a smaller pool,
// because every bad piece is a whole day of the rotation.

/** What makes a piece about a couple rather than about people in general.
 * Deliberately narrow: "amor" and "relación" on their own also match pieces
 * about friendship, work and self-esteem. */
const CLAVES = [
  'pareja',
  'parejas',
  'matrimonio',
  'novio',
  'novia',
  'esposo',
  'esposa',
  'marido',
  'convivencia',
  'divorcio',
  'ruptura',
  'celos',
  'infidelidad',
  'enamora',
  'romantic',
  'apego',
  'intimidad',
  'monogam',
  'convivir',
]

/** Thrown out whatever the source, and the reason a couples feed still needs
 * reading rather than just relaying. Half of what the couples sites publish
 * is aimed at single people looking — dating apps, how to flirt, where to
 * meet someone. It is about relationships and it is the wrong thing entirely
 * to put in front of two people who already found each other. */
const EXCLUIR = [
  'ligar',
  'ligue',
  'seducir',
  'seduccion',
  'conquistar',
  'coqueteo',
  'flirt',
  'soltero',
  'soltera',
  'solteros',
  'solteras',
  'tinder',
  'bumble',
  'hinge',
  'apps de citas',
  'app de citas',
  'aplicacion de citas',
  'aplicaciones de citas',
  'apps para conocer',
  'encontrar pareja',
  // Product write-ups rather than writing about a relationship. Intimacy
  // itself is fair game on this screen; a review of one is not.
  'vibrador',
  'succionador',
  'consolador',
  'juguete sexual',
  'juguetes sexuales',
  'sex shop',
  'sexshop',
]

const q = {
  todos: db.prepare('SELECT id, titulo, resumen, url, fuente FROM articulos ORDER BY publicado_at DESC'),
  porUrl: db.prepare('SELECT id FROM articulos WHERE url = ?'),
  insertar: db.prepare(
    'INSERT INTO articulos (id, titulo, resumen, url, fuente, publicado_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),
  sobrantes: db.prepare(
    'DELETE FROM articulos WHERE id IN (SELECT id FROM articulos ORDER BY publicado_at DESC LIMIT -1 OFFSET ?)',
  ),
}

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Entities have to go before tags: a title arriving as `&lt;b&gt;` would
 * otherwise turn into a tag only after the tag stripper had already run. */
function aTextoPlano(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Last, so an escaped entity like &amp;lt; doesn't become a real one.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function etiqueta(bloque: string, nombre: string): string {
  const m = new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`, 'i').exec(bloque)
  return m ? aTextoPlano(m[1]) : ''
}

/** Cut on a word, and only add the ellipsis when something was actually
 * dropped — a resumen that already fits shouldn't look truncated. */
function recortar(s: string, largo: number): string {
  if (s.length <= largo) return s
  const corte = s.slice(0, largo)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > largo * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`
}

interface Articulo {
  titulo: string
  resumen: string
  url: string
  fuente: string
  publicadoAt: string
}

/** RSS and Atom in one pass. Both are read for the same five fields, and
 * pulling in a parser for that would be the biggest dependency in the
 * project by some margin. */
export function leerFeed(xml: string, fuente: string): Articulo[] {
  const bloques = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
  const articulos: Articulo[] = []

  for (const bloque of bloques) {
    const titulo = etiqueta(bloque, 'title')
    // Atom puts the address in an attribute; RSS puts it in the element.
    const url = etiqueta(bloque, 'link') || /<link[^>]*href=["']([^"']+)["']/i.exec(bloque)?.[1] || ''
    if (!titulo || !/^https?:\/\//.test(url)) continue

    const resumen = etiqueta(bloque, 'description') || etiqueta(bloque, 'summary')
    const fecha = etiqueta(bloque, 'pubDate') || etiqueta(bloque, 'updated') || etiqueta(bloque, 'published')
    const cuando = fecha ? new Date(fecha) : new Date()

    articulos.push({
      titulo: recortar(titulo, 140),
      resumen: recortar(resumen, LARGO_RESUMEN),
      url,
      fuente,
      // A feed with an unparseable date shouldn't drop out of the pool
      // entirely, and dating it now is the harmless guess.
      publicadoAt: (isNaN(cuando.getTime()) ? new Date() : cuando).toISOString(),
    })
  }
  return articulos
}

/** True when the piece is about a couple. Title and summary both count: a
 * headline like "Cuando uno de los dos se aleja" says nothing on its own. */
export function esDePareja(a: Pick<Articulo, 'titulo' | 'resumen'>): boolean {
  const heno = sinAcentos(`${a.titulo} ${a.resumen}`)
  return CLAVES.some((k) => heno.includes(k))
}

/** Applies to every source, filtered or not. */
export function esDescartable(a: Pick<Articulo, 'titulo' | 'resumen'>): boolean {
  const heno = sinAcentos(`${a.titulo} ${a.resumen}`)
  return EXCLUIR.some((k) => heno.includes(k))
}

async function bajarFuente(fuente: Fuente): Promise<Articulo[]> {
  const corte = AbortSignal.timeout(15000)
  const r = await fetch(fuente.url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: corte })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const xml = await r.text()
  const leidos = leerFeed(xml, fuente.nombre)
  const enTema = fuente.filtrar ? leidos.filter(esDePareja) : leidos
  return enTema.filter((a) => !esDescartable(a))
}

/** One pass over every source. Sources are independent: one being down is
 * one source missing from this round, not a round that didn't happen. */
export async function recolectar(): Promise<{ nuevos: number; fallidas: string[] }> {
  const fallidas: string[] = []
  const encontrados: Articulo[] = []

  const tandas = await Promise.allSettled(FUENTES.map(bajarFuente))
  tandas.forEach((t, i) => {
    if (t.status === 'fulfilled') encontrados.push(...t.value)
    else fallidas.push(`${FUENTES[i].nombre}: ${String(t.reason).slice(0, 80)}`)
  })

  const ahora = new Date().toISOString()
  let nuevos = 0
  for (const a of encontrados) {
    // The url is the identity: the same piece keeps turning up in the feed
    // for as long as it is recent, and it should be stored once.
    if (q.porUrl.get(a.url)) continue
    q.insertar.run(randomUUID(), a.titulo, a.resumen, a.url, a.fuente, a.publicadoAt, ahora)
    nuevos++
  }

  q.sobrantes.run(MAX_ARTICULOS)

  return { nuevos, fallidas }
}

export function articulosDelPozo() {
  const filas = q.todos.all() as {
    id: string
    titulo: string
    resumen: string
    url: string
    fuente: string
  }[]
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen || undefined,
    url: f.url,
    fuente: f.fuente,
  }))
}

/** Kicks off collection on boot and every few hours after. Deliberately not a
 * cron: one process, one place to look, and nothing to install on the box. */
export function programarRecoleccion() {
  const correr = () => {
    recolectar()
      .then(({ nuevos, fallidas }) => {
        console.log(`noticias: ${nuevos} nuevas${fallidas.length ? `, fallaron ${fallidas.length}` : ''}`)
        for (const f of fallidas) console.warn(`noticias: ${f}`)
      })
      .catch((e) => console.error('noticias: la pasada falló entera', e))
  }
  correr()
  const reloj = setInterval(correr, HORAS_ENTRE_PASADAS * 3600000)
  // Nothing here should hold the process open on its own.
  reloj.unref?.()
}
