let csrfReady = false;

function cookieValue(name) {
  return document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('=');
}

async function ensureCsrfToken() {
  if (csrfReady && cookieValue('acme_csrf')) return;
  await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  csrfReady = true;
}

export function clearSession() {
  localStorage.removeItem('usuarioActivo');
}

export function goToLogin() {
  clearSession();
  window.location.replace('/html/login.html');
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

export async function api(path, options = {}) {
  const { redirectOnUnauthorized = true, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) await ensureCsrfToken();
  const headers = new Headers(fetchOptions.headers ?? {});
  if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', cookieValue('acme_csrf') ?? '');
  const response = await fetch(`/api${path}`, { ...fetchOptions, method, headers, credentials: 'same-origin' });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && redirectOnUnauthorized && !path.startsWith('/auth/')) goToLogin();
    throw new Error(payload?.error ?? 'No fue posible completar la solicitud.');
  }
  return payload;
}

export async function currentUser({ redirectOnUnauthorized = true } = {}) {
  return (await api('/me', { redirectOnUnauthorized })).user;
}

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  currencyDisplay: 'code',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(value) {
  return copFormatter.format(Number(value));
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
