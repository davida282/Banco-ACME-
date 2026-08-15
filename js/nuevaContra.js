import { api } from './api.js';
import { setBusy, setMessage } from './ui.js';

const resetToken = new URLSearchParams(window.location.search).get('token');
if (resetToken) history.replaceState({}, document.title, window.location.pathname);
if (!resetToken) window.location.replace('/html/login.html');

const form = document.getElementById('recuperarForm');
const message = document.getElementById('formMessage');
const submitButton = form.querySelector('button[type="submit"]');
const showMessage = (text, type = 'error') => setMessage(message, text, type);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const contrasena = document.getElementById('contrasena').value;
  const confirmacion = document.getElementById('confirmarContra').value;
  if (contrasena.length < 8 || contrasena !== confirmacion) return showMessage('Usa una contraseña de mínimo 8 caracteres y confírmala correctamente.');
  setBusy(submitButton, true, 'Actualizando contraseña…');
  try {
    await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken, contrasena }) });
    window.location.replace('/html/login.html');
  } catch (error) { showMessage(error.message); }
  finally { setBusy(submitButton, false); }
});
