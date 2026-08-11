import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { isProduction, jwtSecret } from './config.js';

export const SESSION_COOKIE = 'acme_session';
export const CSRF_COOKIE = 'acme_csrf';
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export const createToken = (userId, sessionId) => jwt.sign(
  { sub: String(userId), sid: sessionId, purpose: 'session' },
  jwtSecret,
  { algorithm: 'HS256', audience: 'banco-acme', issuer: 'banco-acme-api', expiresIn: '8h' },
);

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  };
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Sesión requerida.' });
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], audience: 'banco-acme', issuer: 'banco-acme-api' });
    const { rows } = await pool.query(
      `SELECT s.id, s.usuario_id, u.rol, u.estado FROM sesiones s
       JOIN usuarios u ON u.id=s.usuario_id
       WHERE s.id=$1 AND s.usuario_id=$2 AND s.revocada_en IS NULL AND s.expira_en > NOW()`,
      [payload.sid, payload.sub],
    );
    if (!rows[0]) throw new Error('Sesión revocada');
    req.userId = Number(rows[0].usuario_id);
    req.sessionId = rows[0].id;
    req.userRole = rows[0].rol;
    if (rows[0].estado !== 'activa') throw new Error('Cuenta desactivada');
    return next();
  } catch {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return res.status(401).json({ error: 'Sesión inválida o vencida.' });
  }
}

export function requireSuperuser(req, res, next) {
  if (req.userRole !== 'superusuario') return res.status(403).json({ error: 'Se requieren permisos de superusuario.' });
  return next();
}
