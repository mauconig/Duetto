import { verifyToken } from '@clerk/backend'
import type { NextFunction, Request, Response } from 'express'

const SECRET_KEY = process.env.CLERK_SECRET_KEY

if (!SECRET_KEY) {
  throw new Error('Falta CLERK_SECRET_KEY en el entorno')
}

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
