import { api, currentUser, formatMoney, newIdempotencyKey } from './api.js';
import { setBusy, setMessage, setRegionBusy, trapFocus } from './ui.js';

const form = document.getElementById('servicePaymentForm');
const service = document.getElementById('servicio');
const reference = document.getElementById('referencia');
const amount = document.getElementById('cantidad');
const continueButton = document.getElementById('continuePayment');
const message = document.getElementById('transactionMessage');
const modal = document.getElementById('servicePaymentModal');
const cancelButton = document.getElementById('cancelPayment');
const commitButton = document.getElementById('commitPayment');
const modalMessage = document.getElementById('modalMessage');
const fieldMessages = {
  service: document.getElementById('serviceMessage'), reference: document.getElementById('referenceMessage'), amount: document.getElementById('amountMessage'),
};

let user = null;
let catalog = new Map();
let paymentPreview = null;
let submitting = false;
let lastFocusedElement = null;

const showMessage = (text = '', type = 'error') => setMessage(message, text, type);
const setFieldMessage = (field, text = '', state = '') => {
  const output = fieldMessages[field];
  output.textContent = text;
  output.dataset.state = state;
  output.setAttribute('role', state === 'error' ? 'alert' : 'status');
};
const clearFieldMessages = () => Object.keys(fieldMessages).forEach((field) => setFieldMessage(field));

function closeModal() {
  if (modal.hidden || submitting) return;
  modal.hidden = true;
  setMessage(modalMessage, '');
  paymentPreview = null;
  lastFocusedElement?.focus();
}

function openModal() {
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  commitButton.focus();
}

function selectedConfig() {
  return catalog.get(service.value);
}

function refreshServiceGuidance() {
  const config = selectedConfig();
  clearFieldMessages();
  reference.value = '';
  amount.value = '';
  if (!config) {
    reference.disabled = true;
    amount.disabled = true;
    continueButton.disabled = true;
    document.getElementById('serviceHelp').textContent = 'Selecciona un servicio para consultar sus condiciones.';
    document.getElementById('referenceHelp').textContent = 'Cada servicio usa un formato de referencia diferente.';
    document.getElementById('amountHelp').textContent = 'El valor permitido depende del servicio seleccionado.';
    return;
  }
  reference.disabled = false;
  amount.disabled = false;
  continueButton.disabled = false;
  reference.placeholder = config.referenceFormat;
  document.getElementById('serviceHelp').textContent = `${config.company} · ${config.type}`;
  document.getElementById('referenceHelp').textContent = `Formato: ${config.referenceFormat}. Inicia el bloque numérico en 00 para simular “no encontrada” o termínalo en 99 para “vencida”.`;
  document.getElementById('amountHelp').textContent = `Valor permitido: ${formatMoney(config.minAmount)} a ${formatMoney(config.maxAmount)}.`;
}

reference.addEventListener('input', () => { reference.value = reference.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); setFieldMessage('reference'); });
amount.addEventListener('input', () => { amount.value = amount.value.replace(/\D/g, ''); setFieldMessage('amount'); });
service.addEventListener('change', refreshServiceGuidance);
cancelButton.addEventListener('click', closeModal);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); trapFocus(modal, event); });

window.addEventListener('DOMContentLoaded', async () => {
  setRegionBusy(form, true);
  try {
    const [loadedUser, catalogPayload] = await Promise.all([currentUser(), api('/services/catalog')]);
    user = loadedUser;
    const services = catalogPayload.services;
    document.getElementById('cuenta').value = user.numeroCuenta;
    document.getElementById('usuario').value = `${user.nombres} ${user.apellidos}`;
    catalog = new Map(services.map((item) => [item.code, item]));
    service.innerHTML = '<option value="">Selecciona un servicio</option>';
    services.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.code;
      option.textContent = item.name;
      service.append(option);
    });
    service.disabled = false;
    refreshServiceGuidance();
  } catch (error) {
    showMessage(error.message);
  } finally {
    setRegionBusy(form, false);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage();
    clearFieldMessages();
    const config = selectedConfig();
    const value = Number(amount.value);
    if (!config) { setFieldMessage('service', 'Selecciona el servicio que deseas pagar.', 'error'); service.focus(); return; }
    if (!reference.value) { setFieldMessage('reference', 'Ingresa la referencia de la factura.', 'error'); reference.focus(); return; }
    if (!Number.isSafeInteger(value) || value < config.minAmount || value > config.maxAmount) {
      setFieldMessage('amount', `Ingresa un valor entre ${formatMoney(config.minAmount)} y ${formatMoney(config.maxAmount)}.`, 'error'); amount.focus(); return;
    }
    setBusy(continueButton, true, 'Consultando factura…');
    try {
      const { service: serverService, invoice } = await api(`/services/invoice?servicio=${encodeURIComponent(config.code)}&referencia=${encodeURIComponent(reference.value)}`);
      if (invoice.status !== 'pendiente') {
        setFieldMessage('reference', `${invoice.label}: ${invoice.message}`, invoice.status);
        reference.focus();
        return;
      }
      setFieldMessage('reference', invoice.label, 'pendiente');
      paymentPreview = { config: serverService, referenciaServicio: invoice.reference, valor: value };
      document.getElementById('previewCompany').textContent = serverService.company;
      document.getElementById('previewType').textContent = serverService.type;
      document.getElementById('previewService').textContent = serverService.name;
      document.getElementById('previewReference').textContent = invoice.reference;
      document.getElementById('previewAccount').textContent = user.numeroCuenta;
      document.getElementById('previewAmount').textContent = formatMoney(value);
      document.getElementById('previewBalance').textContent = formatMoney(user.saldo);
      document.getElementById('previewRemaining').textContent = formatMoney(Number(user.saldo) - value);
      openModal();
    } catch (error) {
      setFieldMessage('reference', error.message, 'error');
    } finally {
      setBusy(continueButton, false);
    }
  });

  commitButton.addEventListener('click', async () => {
    if (!paymentPreview || submitting) return;
    submitting = true;
    setBusy(commitButton, true, 'Pagando servicio…');
    cancelButton.disabled = true;
    setMessage(modalMessage, '');
    try {
      const { transaction } = await api('/transactions/service-payment', {
        method: 'POST', headers: { 'Idempotency-Key': newIdempotencyKey() },
        body: JSON.stringify({ servicio: paymentPreview.config.code, referenciaServicio: paymentPreview.referenciaServicio, valor: paymentPreview.valor }),
      });
      sessionStorage.setItem('permisoServicio', 'true');
      sessionStorage.setItem('datosPagoServicio', JSON.stringify({ fecha: new Date(transaction.fecha).toLocaleString('es-CO'), referencia: transaction.referencia, servicio: transaction.service?.name ?? paymentPreview.config.name, empresa: transaction.service?.company ?? paymentPreview.config.company, valor: transaction.valor }));
      window.location.href = '/pago-exitoso';
    } catch (error) {
      setMessage(modalMessage, error.message);
      submitting = false;
      setBusy(commitButton, false);
      cancelButton.disabled = false;
    }
  });
});
