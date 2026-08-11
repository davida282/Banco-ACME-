import { formatMoney } from './api.js';

const transaction = JSON.parse(sessionStorage.getItem('datosRetiro') ?? 'null');
const allowed = sessionStorage.getItem('permisoRetiro') === 'true';

if (!allowed || !transaction) {
  window.location.replace('/html/dashboard.html');
} else {
  sessionStorage.removeItem('permisoRetiro');
  sessionStorage.removeItem('datosRetiro');
  document.getElementById('fecha').textContent = transaction.fecha;
  document.getElementById('referencia').textContent = transaction.referencia;
  document.getElementById('tipoTransaccion').textContent = 'Retiro';
  document.getElementById('descripcion').textContent = 'Retiro de dinero por canal electrónico';
  document.getElementById('valor').textContent = formatMoney(transaction.valor);
}

document.getElementById('volver').addEventListener('click', () => {
  window.location.href = '/html/dashboard.html';
});

document.getElementById('imprimir').addEventListener('click', () => window.print());
