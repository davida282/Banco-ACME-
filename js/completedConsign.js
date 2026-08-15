import { formatMoney } from './api.js';

const datosTransaccion = JSON.parse(sessionStorage.getItem('datosConsignacion') ?? 'null');
const permiso = sessionStorage.getItem('permisoConsignacion');

if (permiso !== 'true' || !datosTransaccion) {
  window.location.replace('/dashboard');
} else {
  sessionStorage.removeItem('permisoConsignacion');
  sessionStorage.removeItem('datosConsignacion');
  document.getElementById('fecha').textContent = datosTransaccion.fecha;
  document.getElementById('referencia').textContent = datosTransaccion.referencia;
  document.getElementById('tipoTransaccion').textContent = 'Consignación electrónica';
  document.getElementById('destinatario').textContent = datosTransaccion.destinatario;
  document.getElementById('descripcion').textContent = `Consignación a la cuenta ${datosTransaccion.cuentaDestino}`;
  document.getElementById('valor').textContent = formatMoney(datosTransaccion.valor);
}

document.getElementById('volver').addEventListener('click', () => { window.location.href = '/dashboard'; });
document.getElementById('imprimir').addEventListener('click', () => { window.print(); });
