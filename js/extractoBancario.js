import { currentUser } from './api.js';
import { setBusy, setMessage, setRegionBusy } from './ui.js';

const form = document.getElementById('statementForm');
const message = document.getElementById('statementMessage');
const submitButton = document.getElementById('confirmarBtn');
const currentPeriodButton = document.getElementById('currentPeriodBtn');
const yearField = document.getElementById('anio');
const monthField = document.getElementById('mes');

currentPeriodButton.addEventListener('click', () => {
  const today = new Date();
  yearField.value = String(today.getFullYear());
  monthField.value = String(today.getMonth() + 1).padStart(2, '0');
  setMessage(message, 'Periodo actual seleccionado.', 'success');
  submitButton.focus();
});

window.addEventListener('DOMContentLoaded', async () => {
  setRegionBusy(form, true);
  try {
    const user = await currentUser();
    document.getElementById('numCuenta').value = user.numeroCuenta;
    document.getElementById('usuario').value = `${user.nombres} ${user.apellidos}`;
  } catch { return; }
  finally { setRegionBusy(form, false); }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const anio = yearField.value.trim();
    const mes = monthField.value;
    if (!/^20\d{2}$/.test(anio) || !mes) {
      setMessage(message, 'Selecciona un año y un mes válidos.');
      (!anio ? yearField : monthField).focus();
      return;
    }
    setMessage(message, '', 'info');
    setBusy(submitButton, true, 'Generando extracto…');
    localStorage.setItem('filtrosExtracto', JSON.stringify({ anio, mes }));
    window.location.href = '/extracto/resultado';
  });
});
