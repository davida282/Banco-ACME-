import { api } from './api.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('recuperarForm');
const message = document.getElementById('formMessage');
const emailStep = document.getElementById('emailStep');
const passwordStep = document.getElementById('passwordStep');
const continueButton = document.getElementById('continueButton');
const resetButton = document.getElementById('resetButton');
const emailInput = document.getElementById('correo');
const passwordInput = document.getElementById('contrasena');
const confirmationInput = document.getElementById('confirmarContra');
const successPanel = document.getElementById('successPanel');
let resetToken = null;

const showMessage = (text, type = 'error') => setMessage(message, text, type);

function showPasswordStep(email) {
  emailStep.hidden = true;
  passwordStep.hidden = false;
  document.getElementById('verifiedEmail').textContent = email;
  document.getElementById('emailProgress').classList.remove('is-active');
  document.getElementById('emailProgress').classList.add('is-complete');
  document.getElementById('emailProgress').removeAttribute('aria-current');
  document.getElementById('passwordProgress').classList.add('is-active');
  document.getElementById('passwordProgress').setAttribute('aria-current', 'step');
  passwordInput.focus();
}

function showEmailStep() {
  resetToken = null;
  passwordStep.hidden = true;
  emailStep.hidden = false;
  passwordInput.value = '';
  confirmationInput.value = '';
  showMessage('');
  document.getElementById('emailProgress').className = 'is-active';
  document.getElementById('emailProgress').setAttribute('aria-current', 'step');
  document.getElementById('passwordProgress').className = '';
  document.getElementById('passwordProgress').removeAttribute('aria-current');
  emailInput.focus();
}

async function confirmEmail() {
  const email = emailInput.value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    showMessage('Ingresa un correo válido.');
    emailInput.focus();
    return;
  }
  setBusy(continueButton, true, 'Verificando…');
  try {
    const response = await api('/auth/recovery', { method: 'POST', body: JSON.stringify({ email }) });
    if (!response.resetToken) throw new Error('No fue posible iniciar la recuperación.');
    resetToken = response.resetToken;
    showMessage(response.message, 'success');
    showPasswordStep(email);
  } catch (error) { showMessage(error.message); }
  finally { setBusy(continueButton, false); }
}

async function updatePassword() {
  const password = passwordInput.value;
  const confirmation = confirmationInput.value;
  if (password.length < 8) {
    showMessage('La nueva contraseña debe tener mínimo 8 caracteres.');
    passwordInput.focus();
    return;
  }
  if (password !== confirmation) {
    showMessage('Las contraseñas deben coincidir.');
    confirmationInput.focus();
    return;
  }
  if (!resetToken) return showEmailStep();

  setBusy(resetButton, true, 'Actualizando…');
  try {
    await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, contrasena: password }),
    });
    resetToken = null;
    form.hidden = true;
    successPanel.hidden = false;
    successPanel.focus();
  } catch (error) { showMessage(error.message); }
  finally { setBusy(resetButton, false); }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  if (emailStep.hidden) await updatePassword();
  else await confirmEmail();
});

document.getElementById('changeEmail').addEventListener('click', showEmailStep);
emailInput.addEventListener('input', () => showMessage(''));
passwordInput.addEventListener('input', () => showMessage(''));
confirmationInput.addEventListener('input', () => showMessage(''));
