import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createToken, csrfCookieOptions, requireAuth, requireSuperuser, SESSION_COOKIE, sessionCookieOptions, SESSION_DURATION_MS } from './auth.js';
import { pool, withTransaction } from './db.js';
import { recoveryEmailConfigured, sendPasswordRecoveryEmail } from './email.js';
import { csrfProtection, ensureCsrfCookie, hashIp, hashResetToken } from './security.js';
import { appOrigin, isProduction, port } from './config.js';

const app = express();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accountColumns = `id, numero_cuenta, tipo_documento, documento, nombres, apellidos, email, telefono, direccion, ciudad, genero, saldo, creado_en, rol, estado`;
const INITIAL_ACCOUNT_BALANCE_COP = 500_000;
const LOAN_MIN_COP = 50_000;
const LOAN_MAX_COP = 5_000_000;
const LOAN_MONTHLY_RATE = 0.015;
const LOAN_TERMS = new Set([3, 6, 12]);
const PASSWORD_HASH_PREFIX = 'bcrypt-sha256$';

function secretsMatch(received, expected) {
  const receivedValue = Buffer.from(received ?? '');
  const expectedValue = Buffer.from(expected ?? '');
  return receivedValue.length === expectedValue.length && crypto.timingSafeEqual(receivedValue, expectedValue);
}

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'"],
    },
  },
  hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const localSkip = () => !isProduction;
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, skip: localSkip, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skip: localSkip, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos. Espera 15 minutos.' } });
const recoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, skip: localSkip, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos. Espera 15 minutos.' } });
const moneyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, skip: localSkip, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas solicitudes. Inténtalo en un minuto.' } });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, skip: localSkip, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiadas acciones administrativas. Inténtalo en un minuto.' } });

app.use('/api', apiLimiter);
app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) { return next(error); }
});

app.get('/api/cron/neon-backup', async (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.get('Authorization');
  if (!cronSecret || !secretsMatch(authorization, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const projectId = process.env.NEON_PROJECT_ID;
  const branchId = process.env.NEON_BRANCH_ID;
  const apiKey = process.env.NEON_API_KEY;
  if (!projectId || !branchId || !apiKey) {
    return next(new Error('La automatización de respaldo no está configurada.'));
  }

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const snapshotName = `banco-acme-auto-${now.toISOString().slice(0, 10)}`;
    const projectUrl = `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`;
    const apiHeaders = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
    const snapshotsResponse = await fetch(`${projectUrl}/snapshots`, { headers: apiHeaders });
    if (!snapshotsResponse.ok) {
      console.error(`No se pudieron consultar los snapshots de Neon (HTTP ${snapshotsResponse.status}).`);
      return next(new Error('No se pudo preparar el respaldo automático.'));
    }

    const { snapshots = [] } = await snapshotsResponse.json();
    const replaceableSnapshots = snapshots.filter((snapshot) => snapshot.name?.startsWith('banco-acme-'));
    for (const snapshot of replaceableSnapshots) {
      const deleteResponse = await fetch(`${projectUrl}/snapshots/${encodeURIComponent(snapshot.id)}`, {
        method: 'DELETE',
        headers: apiHeaders,
      });
      if (!deleteResponse.ok) {
        console.error(`No se pudo reemplazar el snapshot automático de Neon (HTTP ${deleteResponse.status}).`);
        return next(new Error('No se pudo reemplazar el respaldo automático.'));
      }
    }

    const snapshotUrl = new URL(`${projectUrl}/branches/${encodeURIComponent(branchId)}/snapshot`);
    snapshotUrl.searchParams.set('name', snapshotName);
    snapshotUrl.searchParams.set('expires_at', expiresAt.toISOString());

    const response = await fetch(snapshotUrl, {
      method: 'POST',
      headers: apiHeaders,
    });
    if (response.status === 409) {
      return res.status(200).json({ status: 'already-created', name: snapshotName });
    }
    if (!response.ok) {
      console.error(`No se pudo crear el snapshot automático de Neon (HTTP ${response.status}).`);
      return next(new Error('No se pudo crear el respaldo automático.'));
    }

    const { snapshot } = await response.json();
    return res.status(201).json({
      status: 'created',
      id: snapshot.id,
      name: snapshot.name,
      expiresAt: snapshot.expires_at,
      replaced: replaceableSnapshots.length,
    });
  } catch (error) { return next(error); }
});
app.get('/api/auth/csrf', (req, res) => { ensureCsrfCookie(req, res); res.status(204).end(); });
app.use('/api', csrfProtection);

function publicUser(user) {
  return {
    id: user.id, numeroCuenta: String(user.numero_cuenta), tipoDocumento: user.tipo_documento,
    documento: user.documento, nombres: user.nombres, apellidos: user.apellidos, email: user.email,
    telefono: user.telefono, direccion: user.direccion, ciudad: user.ciudad, genero: user.genero,
    saldo: Number(user.saldo), fechaCreacion: user.creado_en, rol: user.rol, estado: user.estado,
  };
}
const validText = (value, min = 1, max = 255) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const amount = (value, min = 1) => Number.isSafeInteger(Number(value)) && Number(value) >= min ? Number(value) : null;
const reference = () => String(crypto.randomInt(1_000_000_000, 9_999_999_999));
const validName = (value) => typeof value === 'string' && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[\s'-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/.test(value.trim()) && validText(value, 2, 40);
const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const validPassword = (value) => typeof value === 'string' && value.length >= 8;
const documentTypes = new Set(['TI', 'CC', 'TE', 'CE']);
const genders = new Set(['Masculino', 'Femenino', 'No especificado']);

function passwordDigest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('base64');
}

async function hashPassword(value) {
  return `${PASSWORD_HASH_PREFIX}${await bcrypt.hash(passwordDigest(value), 12)}`;
}

async function verifyPassword(value, storedHash) {
  if (storedHash.startsWith(PASSWORD_HASH_PREFIX)) {
    return bcrypt.compare(passwordDigest(value), storedHash.slice(PASSWORD_HASH_PREFIX.length));
  }
  return bcrypt.compare(value, storedHash);
}

function loanQuote(value, term) {
  const interest = Math.round(value * LOAN_MONTHLY_RATE * term);
  const total = value + interest;
  return {
    monto: value,
    plazoMeses: term,
    tasaMensual: LOAN_MONTHLY_RATE,
    intereses: interest,
    totalPagar: total,
    cuotaMensual: Math.ceil(total / term),
  };
}

function publicLoan(row) {
  return {
    id: Number(row.id), referencia: row.referencia, monto: Number(row.monto),
    plazoMeses: Number(row.plazo_meses), tasaMensual: Number(row.tasa_mensual),
    intereses: Number(row.intereses), totalPagar: Number(row.total_pagar),
    cuotaMensual: Number(row.cuota_mensual), estado: row.estado, fecha: row.creado_en,
  };
}

const serviceCatalog = {
  energia: { code: 'energia', name: 'Energía', company: 'Energía Andina S.A. E.S.P.', type: 'Servicio público', referenceFormat: 'ENE-########', referencePattern: /^ENE-\d{8}$/, minAmount: 10000, maxAmount: 900000 },
  agua: { code: 'agua', name: 'Agua', company: 'Aguas del Río S.A. E.S.P.', type: 'Servicio público', referenceFormat: 'AGU-########', referencePattern: /^AGU-\d{8}$/, minAmount: 10000, maxAmount: 500000 },
  gas: { code: 'gas', name: 'Gas', company: 'Gas Natural del Centro S.A. E.S.P.', type: 'Servicio público', referenceFormat: 'GAS-########', referencePattern: /^GAS-\d{8}$/, minAmount: 10000, maxAmount: 400000 },
  internet: { code: 'internet', name: 'Internet', company: 'ConectaNet Colombia S.A.S.', type: 'Telecomunicaciones', referenceFormat: 'INT-##########', referencePattern: /^INT-\d{10}$/, minAmount: 20000, maxAmount: 600000 },
  telefonia: { code: 'telefonia', name: 'Telefonía', company: 'Móvil ClaroSim S.A.S.', type: 'Telecomunicaciones', referenceFormat: 'TEL-##########', referencePattern: /^TEL-\d{10}$/, minAmount: 5000, maxAmount: 350000 },
  television: { code: 'television', name: 'Televisión', company: 'Visión Hogar S.A.S.', type: 'Entretenimiento', referenceFormat: 'TV-########', referencePattern: /^TV-\d{8}$/, minAmount: 10000, maxAmount: 300000 },
  administracion: { code: 'administracion', name: 'Administración', company: 'Gestión Residencial ACME S.A.S.', type: 'Propiedad horizontal', referenceFormat: 'ADM-########', referencePattern: /^ADM-\d{8}$/, minAmount: 50000, maxAmount: 2000000 },
};

function publicService(config) {
  return {
    code: config.code, name: config.name, company: config.company, type: config.type,
    referenceFormat: config.referenceFormat, minAmount: config.minAmount, maxAmount: config.maxAmount,
  };
}

function serviceReferenceDigits(referenceValue) {
  return String(referenceValue).replace(/\D/g, '');
}

async function serviceInvoiceState(client, userId, config, serviceReference) {
  const digits = serviceReferenceDigits(serviceReference);
  if (digits.startsWith('00')) {
    return { status: 'no_encontrada', label: 'Factura no encontrada', message: 'No encontramos una factura simulada con esa referencia.' };
  }
  const { rows } = await client.query(
    `SELECT referencia FROM transacciones
     WHERE usuario_id=$1 AND servicio_codigo=$2 AND referencia_servicio=$3
     LIMIT 1`,
    [userId, config.code, serviceReference],
  );
  if (rows[0]) {
    return { status: 'pagada', label: 'Factura pagada', message: 'Esta factura ya fue pagada desde esta cuenta.' };
  }
  if (digits.endsWith('99')) {
    return { status: 'vencida', label: 'Factura vencida', message: 'Esta factura simulada está vencida y no puede pagarse por este canal.' };
  }
  return { status: 'pendiente', label: 'Factura pendiente', message: 'Factura simulada disponible para pago.' };
}

async function movement(client, { userId, destinationId = null, type, concept, value, idempotencyKey = null }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await client.query(
        `INSERT INTO transacciones (usuario_id, cuenta_destino_id, referencia, tipo, concepto, valor, fecha, clave_idempotencia)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7) RETURNING id, referencia, tipo, concepto, valor, fecha, estado`,
        [userId, destinationId, reference(), type, concept, value, idempotencyKey],
      );
      return rows[0];
    } catch (error) {
      if (error.code !== '23505' || attempt === 4) throw error;
    }
  }
}

function idempotencyKey(req) {
  const key = req.get('Idempotency-Key');
  return typeof key === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(key) ? key : null;
}

async function previousMovement(client, userId, key) {
  if (!key) return null;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${userId}:${key}`]);
  const { rows } = await client.query(
    `SELECT id, referencia, tipo, concepto, valor, fecha, estado
     FROM transacciones WHERE usuario_id=$1 AND clave_idempotencia=$2`,
    [userId, key],
  );
  return rows[0] ?? null;
}

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  const body = req.body ?? {};
  const required = ['tipoDocumento', 'genero', 'ciudad', 'documento', 'telefono', 'nombres', 'apellidos', 'direccion', 'email'];
  if (required.some((key) => !validText(body[key])) || typeof body.contrasena !== 'string') return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  if (!/^\d{10}$/.test(String(body.documento)) || !/^\d{10}$/.test(String(body.telefono))) return res.status(400).json({ error: 'Documento y teléfono deben tener exactamente 10 dígitos.' });
  if (!documentTypes.has(body.tipoDocumento.trim()) || !genders.has(body.genero.trim()) || !validName(body.nombres) || !validName(body.apellidos) || !validText(body.direccion, 6, 255) || !validText(body.ciudad, 2, 100)) return res.status(400).json({ error: 'Revisa los datos de identificación y contacto.' });
  if (!validEmail(body.email) || !validPassword(body.contrasena)) return res.status(400).json({ error: 'Usa un correo válido y una contraseña de mínimo 8 caracteres.' });
  try {
    const user = await withTransaction(async (client) => {
      const duplicateDocument = await client.query('SELECT 1 FROM usuarios WHERE documento=$1 LIMIT 1', [body.documento.trim()]);
      if (duplicateDocument.rowCount) throw Object.assign(new Error('Ya existe una cuenta registrada con ese número de documento.'), { status: 409 });
      const { rows: accountRows } = await client.query("SELECT nextval('usuarios_numero_cuenta_seq') AS numero");
      const passwordHash = await hashPassword(body.contrasena);
      const { rows } = await client.query(
        `INSERT INTO usuarios (numero_cuenta,tipo_documento,documento,nombres,apellidos,email,telefono,direccion,ciudad,genero,password_hash,saldo,creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING ${accountColumns}`,
        [String(accountRows[0].numero), body.tipoDocumento.trim(), body.documento.trim(), body.nombres.trim(), body.apellidos.trim(), body.email.trim().toLowerCase(), body.telefono.trim(), body.direccion.trim(), body.ciudad.trim(), body.genero.trim(), passwordHash, INITIAL_ACCOUNT_BALANCE_COP],
      );
      return rows[0];
    });
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'usuarios_documento_key') return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese número de documento.' });
    return next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const contrasena = req.body?.contrasena;
  if (!/^\S+@\S+\.\S+$/.test(email) || typeof contrasena !== 'string' || contrasena.length === 0) return res.status(400).json({ error: 'Correo o contraseña inválidos.' });
  try {
    const { rows } = await pool.query(`SELECT ${accountColumns}, password_hash FROM usuarios WHERE LOWER(email)=$1`, [email]);
    const matches = [];
    for (const row of rows) {
      if (await verifyPassword(contrasena, row.password_hash)) matches.push(row);
    }
    if (!matches.length) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    if (matches.length > 1) return res.status(409).json({ error: 'Más de una cuenta coincide con estas credenciales. Contacta al administrador.' });
    const user = matches[0];
    if (user.estado !== 'activa') return res.status(403).json({ error: 'Esta cuenta está desactivada. Contacta al administrador.' });
    if (!user.password_hash.startsWith(PASSWORD_HASH_PREFIX)) {
      await pool.query('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [await hashPassword(contrasena), user.id]);
    }
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await pool.query('INSERT INTO sesiones (id, usuario_id, expira_en, ip_hash, agente_usuario) VALUES ($1,$2,$3,$4,$5)', [sessionId, user.id, expiresAt, hashIp(req.ip), req.get('User-Agent')?.slice(0, 255) ?? null]);
    res.cookie(SESSION_COOKIE, createToken(user.id, sessionId), sessionCookieOptions());
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE sesiones SET revocada_en=NOW() WHERE id=$1 AND usuario_id=$2', [req.sessionId, req.userId]);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.post('/api/auth/recovery', recoveryLimiter, async (req, res, next) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Ingresa un correo válido.' });
  if (!recoveryEmailConfigured()) return res.status(503).json({ error: 'La recuperación por correo aún no está configurada.' });
  try {
    const { rows } = await pool.query("SELECT id, email FROM usuarios WHERE LOWER(email)=$1 AND estado='activa'", [email]);
    for (const user of rows) {
      const rawToken = crypto.randomBytes(32).toString('base64url');
      await withTransaction(async (client) => {
        await client.query('UPDATE tokens_recuperacion_contrasena SET usado_en=NOW() WHERE usuario_id=$1 AND usado_en IS NULL', [user.id]);
        await client.query('INSERT INTO tokens_recuperacion_contrasena (usuario_id, token_hash, expira_en) VALUES ($1,$2,NOW() + INTERVAL \'15 minutes\')', [user.id, hashResetToken(rawToken)]);
      });
      const resetUrl = `${appOrigin}/screens/nuevaContra.html?token=${encodeURIComponent(rawToken)}`;
      await sendPasswordRecoveryEmail({ to: user.email, resetUrl });
    }
    return res.status(202).json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación.' });
  } catch (error) { return next(error); }
});

app.post('/api/auth/reset-password', recoveryLimiter, async (req, res, next) => {
  const resetToken = String(req.body?.resetToken ?? '');
  const contrasena = req.body?.contrasena;
  if (!validPassword(contrasena) || resetToken.length < 40) return res.status(400).json({ error: 'La solicitud o contraseña no son válidas.' });
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT t.id AS token_id, t.usuario_id, u.password_hash FROM tokens_recuperacion_contrasena t
         JOIN usuarios u ON u.id=t.usuario_id
         WHERE t.token_hash=$1 AND t.usado_en IS NULL AND t.expira_en > NOW() FOR UPDATE`,
        [hashResetToken(resetToken)],
      );
      if (!rows[0]) throw Object.assign(new Error('El enlace venció o no es válido.'), { status: 401 });
      if (await verifyPassword(contrasena, rows[0].password_hash)) throw Object.assign(new Error('La nueva contraseña debe ser diferente.'), { status: 400 });
      await client.query('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [await hashPassword(contrasena), rows[0].usuario_id]);
      await client.query('UPDATE tokens_recuperacion_contrasena SET usado_en=NOW() WHERE id=$1', [rows[0].token_id]);
      await client.query('UPDATE sesiones SET revocada_en=NOW() WHERE usuario_id=$1 AND revocada_en IS NULL', [rows[0].usuario_id]);
    });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${accountColumns} FROM usuarios WHERE id=$1`, [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) { return next(error); }
});

app.patch('/api/me', requireAuth, async (req, res, next) => {
  const allowed = ['email', 'telefono', 'direccion', 'ciudad', 'genero'];
  const changes = Object.entries(req.body ?? {}).filter(([key, value]) => allowed.includes(key) && validText(value));
  if (!changes.length) return res.status(400).json({ error: 'No hay cambios válidos.' });
  const values = changes.map(([, value]) => value.trim());
  const set = changes.map(([key], i) => `${key}=$${i + 1}`).join(', ');
  try {
    const { rows } = await pool.query(`UPDATE usuarios SET ${set} WHERE id=$${values.length + 1} RETURNING ${accountColumns}`, [...values, req.userId]);
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese correo o teléfono ya está registrado.' });
    return next(error);
  }
});

app.get('/api/admin/users', adminLimiter, requireAuth, requireSuperuser, async (req, res, next) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 200);
  try {
    const [{ rows }, { rows: summaryRows }] = await Promise.all([
      pool.query(
        `SELECT id, numero_cuenta, documento, nombres, apellidos, email, saldo, estado, rol, creado_en
         FROM usuarios
         ORDER BY CASE WHEN rol='superusuario' THEN 0 ELSE 1 END, creado_en DESC
         LIMIT $1`,
        [limit],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE estado='activa')::int AS activas,
                COUNT(*) FILTER (WHERE estado='desactivada')::int AS desactivadas,
                COALESCE(SUM(saldo), 0) AS saldo_total
         FROM usuarios`,
      ),
    ]);
    const summary = summaryRows[0];
    return res.json({ users: rows.map((user) => ({
      id: Number(user.id), numeroCuenta: user.numero_cuenta, documento: user.documento,
      nombres: user.nombres, apellidos: user.apellidos, email: user.email, saldo: Number(user.saldo),
      estado: user.estado, rol: user.rol, creadoEn: user.creado_en,
    })), summary: {
      total: summary.total,
      activas: summary.activas,
      desactivadas: summary.desactivadas,
      saldoTotal: Number(summary.saldo_total),
    } });
  } catch (error) { return next(error); }
});

app.post('/api/admin/users/:id/deactivate', adminLimiter, requireAuth, requireSuperuser, async (req, res, next) => {
  const targetId = Number(req.params.id);
  if (!Number.isSafeInteger(targetId)) return res.status(400).json({ error: 'Usuario inválido.' });
  if (targetId === req.userId) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
  try {
    const user = await withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'SELECT id, estado, rol FROM usuarios WHERE id=$1 FOR UPDATE',
        [targetId],
      );
      const current = currentRows[0];
      if (!current) throw Object.assign(new Error('Usuario no encontrado.'), { status: 404 });
      if (current.rol === 'superusuario') throw Object.assign(new Error('Las cuentas de superusuario están protegidas.'), { status: 400 });
      if (current.estado === 'desactivada') throw Object.assign(new Error('La cuenta ya está inactiva.'), { status: 409 });

      const reason = 'Desactivación manual desde el panel administrativo';
      const { rows } = await client.query(
        `UPDATE usuarios
         SET estado='desactivada', motivo_estado=$1,
             desactivada_en=NOW(), desactivada_por_id=$2
         WHERE id=$3
         RETURNING id, numero_cuenta, nombres, apellidos, email, saldo, estado`,
        [reason, req.userId, targetId],
      );
      await client.query('UPDATE sesiones SET revocada_en=NOW() WHERE usuario_id=$1 AND revocada_en IS NULL', [targetId]);
      await client.query(
        `INSERT INTO auditoria_administrativa (administrador_id, usuario_afectado_id, accion, motivo, detalle)
         VALUES ($1,$2,'DESACTIVAR_CUENTA',$3,$4::jsonb)`,
        [req.userId, targetId, reason, JSON.stringify({ estado: 'desactivada' })],
      );
      return rows[0];
    });
    return res.json({ user: {
      id: Number(user.id), numeroCuenta: user.numero_cuenta, nombres: user.nombres,
      apellidos: user.apellidos, email: user.email, saldo: Number(user.saldo), estado: user.estado,
    } });
  } catch (error) { return next(error); }
});

app.post('/api/admin/users/:id/reactivate', adminLimiter, requireAuth, requireSuperuser, async (req, res, next) => {
  const targetId = Number(req.params.id);
  if (!Number.isSafeInteger(targetId)) return res.status(400).json({ error: 'Usuario inválido.' });
  try {
    const user = await withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'SELECT id, estado, rol FROM usuarios WHERE id=$1 FOR UPDATE',
        [targetId],
      );
      const current = currentRows[0];
      if (!current) throw Object.assign(new Error('Usuario no encontrado.'), { status: 404 });
      if (current.rol === 'superusuario') throw Object.assign(new Error('Las cuentas de superusuario están protegidas.'), { status: 400 });
      if (current.estado === 'activa') throw Object.assign(new Error('La cuenta ya está activa.'), { status: 409 });

      const reason = 'Reactivación manual desde el panel administrativo';
      const { rows } = await client.query(
        `UPDATE usuarios
         SET estado='activa', motivo_estado=$1, desactivada_en=NULL, desactivada_por_id=NULL
         WHERE id=$2
         RETURNING id, numero_cuenta, nombres, apellidos, email, saldo, estado`,
        [reason, targetId],
      );
      await client.query(
        `INSERT INTO auditoria_administrativa (administrador_id, usuario_afectado_id, accion, motivo, detalle)
         VALUES ($1,$2,'REACTIVAR_CUENTA',$3,$4::jsonb)`,
        [req.userId, targetId, reason, JSON.stringify({ estado: 'activa' })],
      );
      return rows[0];
    });
    return res.json({ user: {
      id: Number(user.id), numeroCuenta: user.numero_cuenta, nombres: user.nombres,
      apellidos: user.apellidos, email: user.email, saldo: Number(user.saldo), estado: user.estado,
    } });
  } catch (error) { return next(error); }
});

app.post('/api/admin/users/:id/adjust-balance', adminLimiter, requireAuth, requireSuperuser, async (req, res, next) => {
  const targetId = Number(req.params.id);
  const delta = Number(req.body?.valor);
  const motivo = String(req.body?.motivo ?? '').trim();
  if (!Number.isSafeInteger(targetId) || !Number.isSafeInteger(delta) || delta === 0 || !validText(motivo, 5, 255)) {
    return res.status(400).json({ error: 'Valor o motivo inválidos.' });
  }
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT id, saldo, estado, rol FROM usuarios WHERE id=$1 FOR UPDATE', [targetId]);
      if (!rows[0]) throw Object.assign(new Error('Usuario no encontrado.'), { status: 404 });
      if (rows[0].estado !== 'activa') throw Object.assign(new Error('No puedes ajustar el saldo de una cuenta inactiva.'), { status: 400 });
      if (Number(rows[0].saldo) + delta < 0) throw Object.assign(new Error('El ajuste dejaría el saldo en negativo.'), { status: 400 });
      await client.query('UPDATE usuarios SET saldo=saldo+$1 WHERE id=$2', [delta, targetId]);
      const transaction = await movement(client, {
        userId: targetId,
        type: 'Ajuste administrativo',
        concept: `${delta > 0 ? 'Abono' : 'Débito'} administrativo: ${motivo}`,
        value: Math.abs(delta),
      });
      await client.query(
        `INSERT INTO auditoria_administrativa (administrador_id, usuario_afectado_id, transaccion_id, accion, motivo, detalle)
         VALUES ($1,$2,$3,'AJUSTE_SALDO',$4,$5::jsonb)`,
        [req.userId, targetId, transaction.id, motivo, JSON.stringify({ delta })],
      );
      return transaction;
    });
    return res.status(201).json({ transaction: result });
  } catch (error) { return next(error); }
});

app.get('/api/admin/audit', adminLimiter, requireAuth, requireSuperuser, async (req, res, next) => {
  const pageSize = 10;
  const requestedPage = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) return res.status(400).json({ error: 'La página solicitada no es válida.' });
  try {
    const totalResult = await pool.query('SELECT COUNT(*)::int AS total FROM auditoria_administrativa');
    const total = totalResult.rows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const { rows } = await pool.query(
      `SELECT a.id, a.accion, a.motivo, a.detalle, a.creada_en,
              admin.nombres || ' ' || admin.apellidos AS administrador,
              target.nombres || ' ' || target.apellidos AS usuario_afectado,
              target.numero_cuenta AS cuenta_afectada,
              t.referencia AS referencia
       FROM auditoria_administrativa a
       JOIN usuarios admin ON admin.id=a.administrador_id
       LEFT JOIN usuarios target ON target.id=a.usuario_afectado_id
       LEFT JOIN transacciones t ON t.id=a.transaccion_id
       ORDER BY a.creada_en DESC, a.id DESC
       LIMIT $1 OFFSET (($2 - 1) * $1)`,
      [pageSize, page],
    );
    return res.json({
      audit: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    });
  } catch (error) { return next(error); }
});

app.post('/api/transactions/withdraw', moneyLimiter, requireAuth, async (req, res, next) => {
  const value = amount(req.body?.valor, 10000);
  const key = idempotencyKey(req);
  if (!value) return res.status(400).json({ error: 'El retiro mínimo es $ 10.000,00.' });
  try {
    const transaction = await withTransaction(async (client) => {
      const previous = await previousMovement(client, req.userId, key);
      if (previous) return previous;
      const { rows } = await client.query('SELECT saldo FROM usuarios WHERE id=$1 FOR UPDATE', [req.userId]);
      if (!rows[0]) throw Object.assign(new Error('Usuario no encontrado.'), { status: 404 });
      if (Number(rows[0].saldo) < value) throw Object.assign(new Error('Saldo insuficiente.'), { status: 400 });
      await client.query('UPDATE usuarios SET saldo=saldo-$1 WHERE id=$2', [value, req.userId]);
      return movement(client, { userId: req.userId, type: 'Retiro', concept: 'Retiro de dinero por canal electrónico', value, idempotencyKey: key });
    });
    return res.status(201).json({ transaction });
  } catch (error) { return next(error); }
});

app.get('/api/services/catalog', requireAuth, (_req, res) => {
  return res.json({ services: Object.values(serviceCatalog).map(publicService) });
});

app.get('/api/services/invoice', moneyLimiter, requireAuth, async (req, res, next) => {
  const serviceCode = String(req.query.servicio ?? '').trim().toLowerCase();
  const serviceReference = String(req.query.referencia ?? '').trim().toUpperCase();
  const config = serviceCatalog[serviceCode];
  if (!config || !config.referencePattern.test(serviceReference)) {
    return res.status(400).json({ error: 'La referencia no corresponde al formato del servicio seleccionado.' });
  }
  try {
    const invoice = await serviceInvoiceState(pool, req.userId, config, serviceReference);
    return res.json({ service: publicService(config), invoice: { reference: serviceReference, ...invoice } });
  } catch (error) { return next(error); }
});

app.post('/api/transactions/service-payment', moneyLimiter, requireAuth, async (req, res, next) => {
  const serviceCode = String(req.body?.servicio ?? '').trim().toLowerCase();
  const serviceReference = String(req.body?.referenciaServicio ?? '').trim().toUpperCase();
  const config = serviceCatalog[serviceCode];
  const value = amount(req.body?.valor, config?.minAmount ?? Number.MAX_SAFE_INTEGER);
  const key = idempotencyKey(req);
  if (!config || !config.referencePattern.test(serviceReference) || !value || value > config.maxAmount) {
    return res.status(400).json({ error: 'Los datos del pago no cumplen las reglas del servicio seleccionado.' });
  }
  try {
    const transaction = await withTransaction(async (client) => {
      const previous = await previousMovement(client, req.userId, key);
      if (previous) return { ...previous, service: publicService(config) };
      const invoice = await serviceInvoiceState(client, req.userId, config, serviceReference);
      if (invoice.status !== 'pendiente') throw Object.assign(new Error(invoice.message), { status: 409 });
      const { rows } = await client.query('SELECT saldo FROM usuarios WHERE id=$1 FOR UPDATE', [req.userId]);
      if (!rows[0] || Number(rows[0].saldo) < value) throw Object.assign(new Error('Saldo insuficiente.'), { status: 400 });
      await client.query('UPDATE usuarios SET saldo=saldo-$1 WHERE id=$2', [value, req.userId]);
      const movementResult = await movement(client, {
        userId: req.userId,
        type: 'Pago de servicio',
        concept: `Pago de ${config.type.toLowerCase()}: ${config.company} (factura ${serviceReference})`,
        value,
        idempotencyKey: key,
      });
      await client.query(
        `UPDATE transacciones
         SET servicio_codigo=$1, referencia_servicio=$2, empresa_servicio=$3
         WHERE id=$4`,
        [config.code, serviceReference, config.company, movementResult.id],
      );
      return { ...movementResult, service: publicService(config) };
    });
    return res.status(201).json({ transaction });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'transacciones_servicio_factura_usuario_unique') {
      return res.status(409).json({ error: 'Esta factura ya fue pagada desde esta cuenta.' });
    }
    return next(error);
  }
});

app.get('/api/transfers/recipients', moneyLimiter, requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT numero_cuenta, nombres, apellidos
       FROM usuarios
       WHERE estado='activa' AND id<>$1
       ORDER BY LOWER(nombres), LOWER(apellidos), numero_cuenta`,
      [req.userId],
    );
    return res.json({
      recipients: rows.map((recipient) => ({
        nombreCompleto: `${recipient.nombres} ${recipient.apellidos}`,
        numeroCuenta: recipient.numero_cuenta,
      })),
    });
  } catch (error) { return next(error); }
});

app.get('/api/transfers/recipient', moneyLimiter, requireAuth, async (req, res, next) => {
  const destinationAccount = String(req.query.numeroCuenta ?? '');
  const value = amount(req.query.valor, 1);
  if (!/^\d{16}$/.test(destinationAccount) || !value) return res.status(400).json({ error: 'Selecciona una cuenta e ingresa un valor válido.' });
  try {
    const { rows } = await pool.query(
      `SELECT destino.id, destino.nombres, destino.apellidos, destino.estado, origen.saldo AS saldo_origen
       FROM usuarios destino
       JOIN usuarios origen ON origen.id=$2
       WHERE destino.numero_cuenta=$1`,
      [destinationAccount, req.userId],
    );
    const recipient = rows[0];
    if (!recipient) return res.status(404).json({ error: 'La cuenta destino no existe.' });
    if (recipient.estado !== 'activa') return res.status(400).json({ error: 'La cuenta destino está desactivada.' });
    if (Number(recipient.id) === req.userId) return res.status(400).json({ error: 'No puedes consignarte a tu propia cuenta.' });
    if (Number(recipient.saldo_origen) < value) return res.status(400).json({ error: 'Saldo insuficiente' });
    return res.json({
      recipient: { nombreCompleto: `${recipient.nombres} ${recipient.apellidos}`, numeroCuenta: destinationAccount },
      balance: { disponible: Number(recipient.saldo_origen), restante: Number(recipient.saldo_origen) - value },
    });
  } catch (error) { return next(error); }
});

app.post('/api/transactions/transfer', moneyLimiter, requireAuth, async (req, res, next) => {
  const value = amount(req.body?.valor, 1);
  const key = idempotencyKey(req);
  const destinationAccount = String(req.body?.numeroCuenta ?? '');
  if (!value || !/^\d{16}$/.test(destinationAccount)) return res.status(400).json({ error: 'Datos de consignación inválidos.' });
  try {
    const transaction = await withTransaction(async (client) => {
      const destinationResult = await client.query('SELECT id, estado, nombres, apellidos FROM usuarios WHERE numero_cuenta=$1', [destinationAccount]);
      const destinationId = destinationResult.rows[0]?.id;
      const destinationName = destinationResult.rows[0] && `${destinationResult.rows[0].nombres} ${destinationResult.rows[0].apellidos}`;
      if (!destinationId) throw Object.assign(new Error('La cuenta destino no existe.'), { status: 404 });
      if (destinationResult.rows[0].estado !== 'activa') throw Object.assign(new Error('La cuenta destino está desactivada.'), { status: 400 });
      if (Number(destinationId) === req.userId) throw Object.assign(new Error('No puedes consignarte a tu propia cuenta.'), { status: 400 });
      const previous = await previousMovement(client, req.userId, key);
      if (previous) return { ...previous, destinatario: destinationName, cuentaDestino: destinationAccount };
      const { rows } = await client.query('SELECT id, saldo FROM usuarios WHERE id=ANY($1) ORDER BY id FOR UPDATE', [[req.userId, destinationId]]);
      const origin = rows.find((row) => Number(row.id) === req.userId);
      if (Number(origin.saldo) < value) throw Object.assign(new Error('Saldo insuficiente.'), { status: 400 });
      await client.query('UPDATE usuarios SET saldo=saldo-$1 WHERE id=$2', [value, req.userId]);
      await client.query('UPDATE usuarios SET saldo=saldo+$1 WHERE id=$2', [value, destinationId]);
      const movementResult = await movement(client, { userId: req.userId, destinationId, type: 'Consignación electrónica', concept: `Consignación a la cuenta ${destinationAccount}`, value, idempotencyKey: key });
      return { ...movementResult, destinatario: destinationName, cuentaDestino: destinationAccount };
    });
    return res.status(201).json({ transaction });
  } catch (error) { return next(error); }
});

app.get('/api/loans', moneyLimiter, requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, referencia, monto, plazo_meses, tasa_mensual, intereses, total_pagar, cuota_mensual, estado, creado_en
       FROM prestamos WHERE usuario_id=$1 ORDER BY creado_en DESC, id DESC LIMIT 10`,
      [req.userId],
    );
    return res.json({
      loans: rows.map(publicLoan),
      configuration: { minimo: LOAN_MIN_COP, maximo: LOAN_MAX_COP, plazos: [...LOAN_TERMS], tasaMensual: LOAN_MONTHLY_RATE },
    });
  } catch (error) { return next(error); }
});

app.post('/api/loans/quote', moneyLimiter, requireAuth, (req, res) => {
  const value = amount(req.body?.monto, LOAN_MIN_COP);
  const term = Number(req.body?.plazoMeses);
  if (!value || value > LOAN_MAX_COP || !LOAN_TERMS.has(term)) {
    return res.status(400).json({ error: 'Selecciona un monto y un plazo válidos para el préstamo.' });
  }
  return res.json({ quote: loanQuote(value, term) });
});

app.post('/api/loans', moneyLimiter, requireAuth, async (req, res, next) => {
  const value = amount(req.body?.monto, LOAN_MIN_COP);
  const term = Number(req.body?.plazoMeses);
  const key = idempotencyKey(req);
  if (!value || value > LOAN_MAX_COP || !LOAN_TERMS.has(term) || !key) {
    return res.status(400).json({ error: 'La solicitud de préstamo no es válida.' });
  }
  try {
    const result = await withTransaction(async (client) => {
      const previous = await previousMovement(client, req.userId, key);
      if (previous) {
        const { rows: previousLoans } = await client.query(
          `SELECT id, referencia, monto, plazo_meses, tasa_mensual, intereses, total_pagar, cuota_mensual, estado, creado_en
           FROM prestamos WHERE transaccion_id=$1`,
          [previous.id],
        );
        if (!previousLoans[0]) throw Object.assign(new Error('La clave de la solicitud ya fue utilizada.'), { status: 409 });
        return { transaction: previous, loan: previousLoans[0] };
      }

      const { rows: users } = await client.query('SELECT saldo, estado FROM usuarios WHERE id=$1 FOR UPDATE', [req.userId]);
      if (!users[0] || users[0].estado !== 'activa') throw Object.assign(new Error('La cuenta no está disponible para solicitar préstamos.'), { status: 403 });
      const quote = loanQuote(value, term);
      await client.query('UPDATE usuarios SET saldo=saldo+$1 WHERE id=$2', [value, req.userId]);
      const transaction = await movement(client, {
        userId: req.userId,
        type: 'Desembolso de préstamo',
        concept: `Préstamo de demostración a ${term} meses`,
        value,
        idempotencyKey: key,
      });
      const { rows: loans } = await client.query(
        `INSERT INTO prestamos
          (usuario_id, transaccion_id, referencia, monto, plazo_meses, tasa_mensual, intereses, total_pagar, cuota_mensual, estado, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'desembolsado',NOW())
         RETURNING id, referencia, monto, plazo_meses, tasa_mensual, intereses, total_pagar, cuota_mensual, estado, creado_en`,
        [req.userId, transaction.id, transaction.referencia, quote.monto, quote.plazoMeses, quote.tasaMensual, quote.intereses, quote.totalPagar, quote.cuotaMensual],
      );
      return { transaction, loan: loans[0] };
    });
    return res.status(201).json({ transaction: result.transaction, loan: publicLoan(result.loan) });
  } catch (error) { return next(error); }
});

app.get('/api/transactions', requireAuth, async (req, res, next) => {
  const pageSize = 10;
  const page = Number(req.query.page ?? 1);
  const year = req.query.year ? Number(req.query.year) : null;
  const month = req.query.month ? Number(req.query.month) : null;
  if (!Number.isSafeInteger(page) || page < 1 || (year && (!Number.isInteger(year) || year < 2000 || year > 2100)) || (month && (!Number.isInteger(month) || month < 1 || month > 12))) {
    return res.status(400).json({ error: 'Página o filtros de fecha inválidos.' });
  }
  try {
    const where = `WHERE (usuario_id=$1 OR cuenta_destino_id=$1)
      AND ($2::int IS NULL OR EXTRACT(YEAR FROM fecha)=$2)
      AND ($3::int IS NULL OR EXTRACT(MONTH FROM fecha)=$3)`;
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM transacciones ${where}`,
      [req.userId, year, month],
    );
    const total = totalResult.rows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const transactionsResult = await pool.query(
      `SELECT id, referencia, tipo, concepto, valor, fecha, usuario_id, cuenta_destino_id FROM transacciones
       ${where}
       ORDER BY fecha DESC, id DESC
       LIMIT $4 OFFSET (($5 - 1) * $4)`, [req.userId, year, month, pageSize, currentPage],
    );
    return res.json({
      transactions: transactionsResult.rows,
      pagination: {
        page: currentPage, pageSize, total, totalPages,
        hasPrevious: currentPage > 1,
        hasNext: currentPage < totalPages,
      },
    });
  } catch (error) { return next(error); }
});

app.get('/api/certificate', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${accountColumns} FROM usuarios WHERE id=$1`, [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) { return next(error); }
});

app.use('/css', express.static(path.join(rootDir, 'css')));
app.use('/js', express.static(path.join(rootDir, 'js')));
app.use('/imgs', express.static(path.join(rootDir, 'imgs')));
app.use('/html', express.static(path.join(rootDir, 'html')));
app.use('/screens', express.static(path.join(rootDir, 'screens')));
// La portada se mantiene limpia: muestra el acceso sin exponer la ruta interna /html/login.html.
app.get('/', (_req, res) => res.sendFile(path.join(rootDir, 'html', 'login.html')));
app.use((error, _req, res, _next) => {
  if (!error.status || error.status >= 500) console.error(error);
  res.status(error.status ?? 500).json({ error: error.status ? error.message : 'Error interno del servidor.' });
});

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(port, () => console.log(`Banco ACME disponible en ${appOrigin}`));
}
export default app;
