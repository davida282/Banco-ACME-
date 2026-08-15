import { formatMoney } from './api.js';

const volverBtn = document.getElementById('volver');
const fechaSpan = document.getElementById('fecha');
const referenciaSpan = document.getElementById('referencia');
const tipoSpan = document.getElementById('tipoTransaccion');
const descripcionSpan = document.getElementById('descripcion');
const valorSpan = document.getElementById('valor');

const permiso = sessionStorage.getItem('permisoServicio');

if (permiso !== 'true') {
  window.location.href = '/dashboard';
} else {
  sessionStorage.removeItem('permisoServicio');
}

const datosTransaccion = JSON.parse(sessionStorage.getItem('datosPagoServicio'));

if (datosTransaccion) {
  fechaSpan.textContent = datosTransaccion.fecha;
  referenciaSpan.textContent = datosTransaccion.referencia;
  tipoSpan.textContent = 'Pago de servicio';
  descripcionSpan.textContent = `Pago de ${datosTransaccion.servicio}${datosTransaccion.empresa ? ` · ${datosTransaccion.empresa}` : ''}`;
  valorSpan.textContent = formatMoney(datosTransaccion.valor);
  sessionStorage.removeItem('datosPagoServicio');
} else {
  window.location.href = '/dashboard';
}

volverBtn.addEventListener('click', () => {
  window.location.href = '/dashboard';
});

document.getElementById('imprimir').addEventListener('click', () => {
  window.print();
});
