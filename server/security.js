import crypto from 'node:crypto';
import { CSRF_COOKIE, csrfCookieOptions } from './auth.js';
import { isProduction, jwtSecret } from './config.js';

export function csrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function ensureCsrfCookie(req, res) {
  if (!req.cookies?.[CSRF_COOKIE]) res.cookie(CSRF_COOKIE, csrfToken(), csrfCookieOptions());
}

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
    return res.status(403).json({ error: 'Solicitud de seguridad inválida. Recarga la página e inténtalo de nuevo.' });
  }
  const matches = crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  if (!matches) return res.status(403).json({ error: 'Solicitud de seguridad inválida. Recarga la página e inténtalo de nuevo.' });
  return next();
}

export function hashIp(ip) {
  return crypto.createHash('sha256').update(`${jwtSecret}:${ip ?? ''}`).digest('hex');
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
