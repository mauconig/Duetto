import { verifyToken } from '@clerk/backend'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const SECRET_KEY = process.env.CLERK_SECRET_KEY
const COOKIE_SECRET = process.env.DUETTE_COOKIE_SECRET

if (!SECRET_KEY) {
  throw new Error('Falta CLERK_SECRET_KEY en el entorno')
}
if (!COOKIE_SECRET) {
  throw new Error('Falta DUETTE_COOKIE_SECRET en el entorno')
}

export const COOKIE_NAME = 'duette_sess'
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface AuthedRequest extends Request {
  userId?: string
}

/** Requires a valid Clerk session token in `Authorization: Bearer <token>`
 * and puts the Clerk user id on the request. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Falta el token de sesión' })
    return
  }
  try {
    const payload = await verifyToken(token, { secretKey: SECRET_KEY })
    if (!payload.sub) {
      res.status(401).json({ error: 'Token sin usuario' })
      return
    }
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o vencido' })
  }
}

function firmar(payload: string): string {
  return createHmac('sha256', COOKIE_SECRET!).update(payload).digest('base64url')
}

/** `<img>` can't send an Authorization header, so photo requests are
 * authenticated with a signed session cookie instead. Issued only after a
 * Clerk token has already been verified. */
export function emitirCookie(res: Response, userId: string) {
  const expira = Date.now() + COOKIE_MAX_AGE_MS
  const payload = `${userId}.${expira}`
  const valor = `${payload}.${firmar(payload)}`
  res.cookie(COOKIE_NAME, valor, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/api',
  })
}

/** Requires the session cookie set by emitirCookie. Used for photo files. */
export function requireCookie(req: AuthedRequest, res: Response, next: NextFunction) {
  const valor = req.cookies?.[COOKIE_NAME]
  if (typeof valor !== 'string') {
    res.status(401).json({ error: 'Falta la sesión' })
    return
  }
  const corte = valor.lastIndexOf('.')
  const payload = valor.slice(0, corte)
  const firma = valor.slice(corte + 1)
  const esperada = firmar(payload)
  const a = Buffer.from(firma)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Sesión inválida' })
    return
  }
  const [userId, expira] = payload.split('.')
  if (!userId || Number(expira) < Date.now()) {
    res.status(401).json({ error: 'Sesión vencida' })
    return
  }
  req.userId = userId
  next()
}
