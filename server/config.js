import 'dotenv/config';

const environment = process.env.NODE_ENV ?? 'development';
export const isProduction = environment === 'production';
export const port = Number(process.env.PORT ?? 3000);
export const jwtSecret = String(process.env.JWT_SECRET ?? '');
export const emailFrom = String(process.env.EMAIL_FROM ?? '').trim();
export const resendApiKey = String(process.env.RESEND_API_KEY ?? '').trim();

function required(value, name) {
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

function normalizedOrigin(value) {
  const origin = String(value ?? '').trim().replace(/\/+$/, '');
  if (!origin) return `http://localhost:${port}`;
  let url;
  try { url = new URL(origin); } catch { throw new Error('APP_ORIGIN debe ser una URL válida.'); }
  if (isProduction && url.protocol !== 'https:') throw new Error('APP_ORIGIN debe usar HTTPS en producción.');
  return url.origin;
}

export const appOrigin = normalizedOrigin(process.env.APP_ORIGIN);

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');

function normalizeSecureDatabaseUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

const databaseUrl = normalizeSecureDatabaseUrl(String(process.env.DATABASE_URL ?? '').trim());
if (isProduction && !databaseUrl) throw new Error('DATABASE_URL es obligatoria en producción.');
if ((resendApiKey && !emailFrom) || (!resendApiKey && emailFrom)) {
  throw new Error('RESEND_API_KEY y EMAIL_FROM deben configurarse juntos.');
}

const useSsl = Boolean(databaseUrl) && (isProduction || process.env.DATABASE_SSL === 'true');
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

export const databaseConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: useSsl ? { rejectUnauthorized } : undefined,
    }
  : {
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? 'Acme Bank',
      user: process.env.PGUSER ?? 'postgres',
      password: required(process.env.PGPASSWORD, 'PGPASSWORD'),
    };

export const publicRuntimeConfig = {
  environment,
  appOrigin,
  emailRecoveryConfigured: Boolean(resendApiKey && emailFrom),
};
