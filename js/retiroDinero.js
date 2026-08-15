import { api, currentUser, formatMoney, newIdempotencyKey } from './api.js';
import { setBusy, setMessage, setRegionBusy, trapFocus } from './ui.js';

const form = document.getElementById('withdrawForm');
const amountInput = document.getElementById('cantidad');
const continueButton = document.getElementById('confirmarBtn');
const message = document.getElementById('transactionMessage');
const modal = document.getElementById('withdrawModal');
const cancelButton = document.getElementById('cancelWithdraw');
const commitButton = document.getElementById('commitWithdraw');
const modalMessage = document.getElementById('modalMessage');

let user = null;
let withdrawalPreview = null;
let submitting = false;
let lastFocusedElement = null;

const showMessage = (text = '', type = 'error') => setMessage(message, text, type);

function closeModal() {
  if (modal.hidden || submitting) return;
  modal.hidden = true;
  setMessage(modalMessage, '');
  withdrawalPreview = null;
  lastFocusedElement?.focus();
}

function openModal() {
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  commitButton.focus();
}

amountInput.addEventListener('input', () => {
  amountInput.value = amountInput.value.replace(/\D/g, '');
});

cancelButton.addEventListener('click', closeModal);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
  trapFocus(modal, event);
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    user = await currentUser();
    document.getElementById('numCuenta').value = user.numeroCuenta;
    document.getElementById('usuario').value = `${user.nombres} ${user.apellidos}`;
    amountInput.disabled = false;
    continueButton.disabled = false;
  } catch {
    return;
  } finally {
    setRegionBusy(form, false);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showMessage();
    const valor = Number(amountInput.value);

    if (!Number.isSafeInteger(valor) || valor < 10000) {
      showMessage('El retiro mínimo es de $ 10.000,00.');
      amountInput.focus();
      return;
    }
    if (valor > Number(user.saldo)) {
      showMessage('No tienes saldo suficiente para realizar este retiro.');
      amountInput.focus();
      return;
    }

    withdrawalPreview = { valor };
    document.getElementById('previewAccount').textContent = user.numeroCuenta;
    document.getElementById('previewUser').textContent = `${user.nombres} ${user.apellidos}`;
    document.getElementById('previewAmount').textContent = formatMoney(valor);
    document.getElementById('previewBalance').textContent = formatMoney(user.saldo);
    document.getElementById('previewRemaining').textContent = formatMoney(Number(user.saldo) - valor);
    openModal();
  });

  commitButton.addEventListener('click', async () => {
    if (!withdrawalPreview || submitting) return;
    submitting = true;
    setBusy(commitButton, true, 'Retirando…');
    cancelButton.disabled = true;
    setMessage(modalMessage, '');

    try {
      const { transaction } = await api('/transactions/withdraw', {
        method: 'POST',
        headers: { 'Idempotency-Key': newIdempotencyKey() },
        body: JSON.stringify({ valor: withdrawalPreview.valor }),
      });
      sessionStorage.setItem('datosRetiro', JSON.stringify({
        fecha: new Date(transaction.fecha).toLocaleString('es-CO'),
        referencia: transaction.referencia,
        valor: transaction.valor,
      }));
      sessionStorage.setItem('permisoRetiro', 'true');
      window.location.href = '/screens/completedRetiro.html';
    } catch (error) {
      setMessage(modalMessage, error.message);
      submitting = false;
      setBusy(commitButton, false);
      cancelButton.disabled = false;
    }
  });
});
