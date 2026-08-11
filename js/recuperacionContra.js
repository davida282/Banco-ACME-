import { api } from './api.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('recuperarForm');
const message = document.getElementById('formMessage');
const submitButton = form.querySelector('button[type="submit"]');
const showMessage = (text, type = 'error') => setMessage(message, text, type);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('correo').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showMessage('Ingresa un correo válido.');
  setBusy(submitButton, true, 'Enviando enlace…');
  try {
    const response = await api('/auth/recovery', { method: 'POST', body: JSON.stringify({ email }) });
    showMessage(response.message, 'success');
    form.reset();
  } catch (error) { showMessage(error.message); }
  finally { setBusy(submitButton, false); }
});
