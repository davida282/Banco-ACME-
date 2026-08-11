import { api, currentUser, formatMoney, newIdempotencyKey } from './api.js';
import { setBusy, setMessage, setRegionBusy, trapFocus } from './ui.js';

const form = document.getElementById('transferForm');
const account = document.getElementById('numCuenta');
const value = document.getElementById('cantidad');
const continueButton = document.getElementById('confirmarBtn');
const message = document.getElementById('transactionMessage');
const modal = document.getElementById('transferModal');
const cancelButton = document.getElementById('cancelTransfer');
const commitButton = document.getElementById('commitTransfer');
const modalMessage = document.getElementById('modalMessage');
const accountHelp = document.getElementById('accountHelp');
const retryRecipients = document.getElementById('retryRecipients');
let transferPreview = null;
let submitting = false;

const showMessage = (text = '', type = 'error') => setMessage(message, text, type);
const closeModal = () => { modal.hidden = true; setMessage(modalMessage, ''); continueButton.focus(); };

function renderRecipients(recipients) {
  account.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = recipients.length ? 'Selecciona una cuenta activa' : 'No hay otras cuentas activas';
  account.append(placeholder);
  recipients.forEach((recipient) => {
    const option = document.createElement('option');
    option.value = recipient.numeroCuenta;
    option.textContent = `${recipient.nombreCompleto} — ${recipient.numeroCuenta}`;
    account.append(option);
  });
  account.disabled = recipients.length === 0;
  continueButton.disabled = recipients.length === 0;
}

function showAccountState(text, type = 'info') {
  accountHelp.textContent = text;
  accountHelp.dataset.state = type;
}

async function loadRecipients() {
  account.replaceChildren(new Option('Cargando cuentas activas…', ''));
  account.disabled = true;
  continueButton.disabled = true;
  retryRecipients.hidden = true;
  showAccountState('Consultando las cuentas disponibles…');
  try {
    const { recipients } = await api('/transfers/recipients');
    renderRecipients(recipients);
    if (recipients.length) {
      showAccountState('Selecciona el nombre; el número de cuenta aparece a su lado.', 'success');
    } else {
      showAccountState('No hay otras cuentas activas disponibles para consignar.', 'info');
    }
  } catch {
    account.replaceChildren(new Option('Cuentas no disponibles', ''));
    account.disabled = true;
    continueButton.disabled = true;
    retryRecipients.hidden = false;
    showAccountState('No pudimos cargar las cuentas. Intenta nuevamente.', 'error');
  }
}

value.addEventListener('input', () => { value.value = value.value.replace(/\D/g, ''); });
account.addEventListener('change', () => showMessage());
retryRecipients.addEventListener('click', loadRecipients);
cancelButton.addEventListener('click', closeModal);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); trapFocus(modal, event); });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage();
  const numeroCuenta = account.value;
  const valor = Number(value.value);
  if (!/^\d{16}$/.test(numeroCuenta) || !Number.isSafeInteger(valor) || valor < 1) {
    showMessage('Selecciona una cuenta destino e ingresa un valor válido.');
    return;
  }
  setBusy(continueButton, true, 'Consultando…');
  try {
    const { recipient } = await api(`/transfers/recipient?numeroCuenta=${encodeURIComponent(numeroCuenta)}`);
    transferPreview = { numeroCuenta, valor, recipient };
    document.getElementById('previewRecipient').textContent = recipient.nombreCompleto;
    document.getElementById('previewAccount').textContent = recipient.numeroCuenta;
    document.getElementById('previewAmount').textContent = formatMoney(valor);
    modal.hidden = false;
    commitButton.focus();
  } catch (error) { showMessage(error.message); }
  finally { setBusy(continueButton, false); }
});

commitButton.addEventListener('click', async () => {
  if (!transferPreview || submitting) return;
  submitting = true;
  setBusy(commitButton, true, 'Consignando…');
  cancelButton.disabled = true;
  setMessage(modalMessage, '');
  try {
    const { transaction } = await api('/transactions/transfer', {
      method: 'POST',
      headers: { 'Idempotency-Key': newIdempotencyKey() },
      body: JSON.stringify({ numeroCuenta: transferPreview.numeroCuenta, valor: transferPreview.valor }),
    });
    sessionStorage.setItem('datosConsignacion', JSON.stringify({
      fecha: new Date(transaction.fecha).toLocaleString('es-CO'), referencia: transaction.referencia,
      valor: transaction.valor, destinatario: transaction.destinatario, cuentaDestino: transaction.cuentaDestino,
    }));
    sessionStorage.setItem('permisoConsignacion', 'true');
    window.location.href = '/screens/completedConsign.html';
  } catch (error) {
    setMessage(modalMessage, error.message);
    submitting = false;
    setBusy(commitButton, false);
    cancelButton.disabled = false;
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await currentUser();
    await loadRecipients();
  } catch { return; }
  finally { setRegionBusy(form, false); }
});
