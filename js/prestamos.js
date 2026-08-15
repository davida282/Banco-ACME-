import { api, currentUser, formatDate, formatMoney, newIdempotencyKey } from './api.js';
import { setBusy, setMessage, setRegionBusy } from './ui.js';

const page = document.querySelector('.loan-page .container');
const form = document.getElementById('loanForm');
const workspace = document.querySelector('.loan-workspace');
const amountField = document.getElementById('loanAmount');
const termField = document.getElementById('loanTerm');
const quoteButton = document.getElementById('quoteLoan');
const quotePanel = document.getElementById('loanQuote');
const cancelButton = document.getElementById('cancelLoan');
const requestButton = document.getElementById('requestLoan');
const message = document.getElementById('loanMessage');
const quoteMessage = document.getElementById('quoteMessage');
const historyBody = document.getElementById('loanHistoryBody');
let quote = null;
let amountValue = 0;

function rawAmount() {
  return amountValue;
}

function renderQuote(value) {
  quote = value;
  document.getElementById('quoteAmount').textContent = formatMoney(value.monto);
  document.getElementById('quoteTerm').textContent = `${value.plazoMeses} meses`;
  document.getElementById('quoteRate').textContent = `${(value.tasaMensual * 100).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
  document.getElementById('quoteInterest').textContent = formatMoney(value.intereses);
  document.getElementById('quoteTotal').textContent = formatMoney(value.totalPagar);
  document.getElementById('quoteInstallment').textContent = formatMoney(value.cuotaMensual);
  workspace.classList.add('has-quote');
  quotePanel.hidden = false;
  setMessage(quoteMessage, '', 'info');
  requestButton.focus();
}

function renderLoans(loans) {
  historyBody.replaceChildren();
  if (!loans.length) {
    const row = historyBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = 'Todavía no tienes préstamos de demostración.';
    return;
  }
  loans.forEach((loan) => {
    const row = historyBody.insertRow();
    [formatDate(loan.fecha), loan.referencia, formatMoney(loan.monto), `${loan.plazoMeses} meses`, formatMoney(loan.cuotaMensual), loan.estado]
      .forEach((value) => { const cell = row.insertCell(); cell.textContent = value; });
  });
}

async function loadLoans() {
  const { loans } = await api('/loans');
  renderLoans(loans);
}

amountField.addEventListener('input', () => {
  const digits = amountField.value.replace(/\D/g, '').slice(0, 7);
  amountField.value = digits;
  amountValue = Number(digits);
  setMessage(message, '', 'info');
});
amountField.addEventListener('blur', () => { if (rawAmount()) amountField.value = formatMoney(rawAmount()); });
amountField.addEventListener('focus', () => { if (rawAmount()) amountField.value = String(rawAmount()); });
termField.addEventListener('change', () => setMessage(message, '', 'info'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const monto = rawAmount();
  const plazoMeses = Number(termField.value);
  if (!Number.isSafeInteger(monto) || monto < 50_000 || monto > 5_000_000 || ![3, 6, 12].includes(plazoMeses)) {
    setMessage(message, 'Ingresa un monto entre $ 50.000,00 y $ 5.000.000,00 y selecciona un plazo.');
    (!monto ? amountField : termField).focus();
    return;
  }
  setBusy(quoteButton, true, 'Calculando…');
  try {
    const response = await api('/loans/quote', { method: 'POST', body: JSON.stringify({ monto, plazoMeses }) });
    setMessage(message, '', 'info');
    renderQuote(response.quote);
  } catch (error) { setMessage(message, error.message); }
  finally { setBusy(quoteButton, false); }
});

cancelButton.addEventListener('click', () => {
  quote = null;
  quotePanel.hidden = true;
  workspace.classList.remove('has-quote');
  amountField.focus();
});

requestButton.addEventListener('click', async () => {
  if (!quote) return;
  setBusy(requestButton, true, 'Desembolsando…');
  cancelButton.disabled = true;
  try {
    const { loan } = await api('/loans', {
      method: 'POST',
      headers: { 'Idempotency-Key': newIdempotencyKey() },
      body: JSON.stringify({ monto: quote.monto, plazoMeses: quote.plazoMeses }),
    });
    const user = await currentUser();
    document.getElementById('loanBalance').textContent = formatMoney(user.saldo);
    setMessage(message, `Préstamo ${loan.referencia} desembolsado por ${formatMoney(loan.monto)}.`, 'success');
    quotePanel.hidden = true;
    workspace.classList.remove('has-quote');
    quote = null;
    amountValue = 0;
    form.reset();
    await loadLoans();
  } catch (error) { setMessage(quoteMessage, error.message); }
  finally { setBusy(requestButton, false); cancelButton.disabled = false; }
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await currentUser();
    document.getElementById('loanAccount').textContent = user.numeroCuenta;
    document.getElementById('loanBalance').textContent = formatMoney(user.saldo);
    await loadLoans();
  } catch { return; }
  finally { setRegionBusy(page, false); }
});
