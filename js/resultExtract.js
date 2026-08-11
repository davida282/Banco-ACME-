import { api, currentUser, formatDate, formatMoney } from './api.js';
import { setRegionBusy } from './ui.js';

const table = document.getElementById('tabla-transacciones');
const summary = document.getElementById('movementSummary');
const previousButton = document.getElementById('previousPage');
const nextButton = document.getElementById('nextPage');
const pageIndicator = document.getElementById('pageIndicator');
const tableRegion = document.querySelector('.tabla-contenedor');
const filters = JSON.parse(localStorage.getItem('filtrosExtracto') ?? 'null');
let currentPage = 1;

function emptyRow(text) {
  const row = table.insertRow();
  const cell = row.insertCell();
  cell.colSpan = 5;
  cell.textContent = text;
}

function transactionRow(tx) {
  const row = table.insertRow();
  [formatDate(tx.fecha), tx.referencia, tx.tipo, tx.concepto, formatMoney(tx.valor)].forEach((value) => {
    const cell = row.insertCell();
    cell.textContent = String(value ?? '');
  });
}

async function loadPage(page) {
  previousButton.disabled = true;
  nextButton.disabled = true;
  table.replaceChildren();
  emptyRow('Cargando extracto…');
  setRegionBusy(tableRegion, true);
  const query = new URLSearchParams({ year: filters.anio, month: filters.mes, page: String(page) });
  try {
    const { transactions, pagination } = await api(`/transactions?${query}`);
    currentPage = pagination.page;
    table.replaceChildren();
    if (!transactions.length) emptyRow('No hay movimientos registrados para ese mes y año.');
    else transactions.forEach(transactionRow);

    const first = pagination.total ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0;
    const last = Math.min(pagination.page * pagination.pageSize, pagination.total);
    summary.textContent = pagination.total
      ? `Mostrando ${first}–${last} de ${pagination.total} movimientos del periodo.`
      : 'No hay movimientos para el periodo seleccionado.';
    pageIndicator.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
    previousButton.disabled = !pagination.hasPrevious;
    nextButton.disabled = !pagination.hasNext;
  } catch (error) {
    table.replaceChildren();
    emptyRow('No fue posible cargar el extracto.');
    summary.textContent = error.message;
    pageIndicator.textContent = 'Página no disponible';
  } finally {
    setRegionBusy(tableRegion, false);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  if (!filters) { window.location.replace('/html/extractoBancario.html'); return; }
  try {
    await currentUser();
    await loadPage(1);
  } catch { window.location.replace('/html/login.html'); }
});

previousButton.addEventListener('click', () => { if (currentPage > 1) loadPage(currentPage - 1); });
nextButton.addEventListener('click', () => loadPage(currentPage + 1));
document.getElementById('volver').addEventListener('click', () => { window.location.href = '/html/dashboard.html'; });
document.getElementById('btnImprimir').addEventListener('click', () => window.print());
