import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { config } from '../../../packages/shared/src/config.js'

let secret = process.env.PATCHLAB_SESSION_SECRET || ''
let password = process.env.PATCHLAB_ADMIN_PASSWORD || ''
export async function initAuth() {
  await fs.mkdir(config.data, { recursive: true })
  const local = ['127.0.0.1', 'localhost', '::1'].includes(config.host)
  if (!local && (password.length < 12 || secret.length < 32))
    throw new Error(
      'Non-loopback binding requires an admin password >=12 chars and a session secret >=32 chars.'
    )
  if (!password) {
    const file = path.join(config.data, 'local-password.txt')
    password = await fs.readFile(file, 'utf8').catch(async () => {
      const generated = randomBytes(18).toString('base64url')
      await fs.writeFile(file, generated, { mode: 0o600, flag: 'wx' })
      return generated
    })
    console.log(`Local login password: ${file} (not exposed via HTTP)`)
  }
  if (password.length < 12) throw new Error('Admin password must be at least 12 characters')
  if (!secret) {
    const file = path.join(config.data, 'session-secret.txt')
    secret = await fs.readFile(file, 'utf8').catch(async () => {
      const generated = randomBytes(32).toString('hex')
      await fs.writeFile(file, generated, { mode: 0o600, flag: 'wx' })
      return generated
    })
  }
}
const sign = (value: string) => createHmac('sha256', secret).update(value).digest('hex')
export function validPassword(input: string) {
  return timingSafeEqual(
    createHash('sha256').update(input).digest(),
    createHash('sha256').update(password).digest()
  )
}
export function authenticated(req: Request) {
  const token =
    (req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('patchlab_session='))
      ?.slice('patchlab_session='.length) || ''
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(payload), 'hex')))
    return false
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return Number.isFinite(parsed.expires) && parsed.expires > Date.now() && parsed.role === 'admin'
  } catch {
    return false
  }
}
export function setSession(res: Response) {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'admin',
      expires: Date.now() + 8 * 60 * 60 * 1000,
      nonce: randomBytes(12).toString('hex')
    })
  ).toString('base64url')
  res.cookie('patchlab_session', `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.PATCHLAB_SECURE_COOKIE === 'true',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  })
}
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authenticated(req)) {
    res.status(401).json({ error: '请先登录' })
    return
  }
  next()
}
export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next()
    return
  }
  const origin = req.headers.origin
  let validOrigin = true
  try {
    if (origin) validOrigin = new URL(origin).host === req.headers.host
  } catch {
    validOrigin = false
  }
  if (req.headers['x-patchlab-request'] !== '1' || !validOrigin) {
    res.status(403).json({ error: 'Invalid same-origin request' })
    return
  }
  next()
}
