import { api, currentUser } from './api.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('loginForm');
const message = document.getElementById('formMessage');
const submitButton = form.querySelector('button[type="submit"]');
const showMessage = (text, type = 'error') => setMessage(message, text, type);
const params = new URLSearchParams(window.location.search);

if (params.get('registro') === 'exitoso') {
  showMessage('Cuenta creada correctamente. Ya puedes iniciar sesión.', 'success');
  history.replaceState({}, document.title, window.location.pathname);
}

currentUser({ redirectOnUnauthorized: false }).then(() => window.location.replace('/dashboard')).catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const contrasena = document.getElementById('contrasena').value;
  if (!/^\S+@\S+\.\S+$/.test(email) || !contrasena) {
    showMessage('Ingresa un correo válido y tu contraseña.');
    return;
  }
  setBusy(submitButton, true, 'Iniciando sesión…');
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, contrasena }) });
    window.location.replace('/dashboard');
  } catch (error) { showMessage(error.message); }
  finally { setBusy(submitButton, false); }
});
