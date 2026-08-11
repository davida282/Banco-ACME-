import { currentUser } from './api.js';
import { setBusy, setMessage, setRegionBusy } from './ui.js';

const form = document.getElementById('statementForm');
const message = document.getElementById('statementMessage');
const submitButton = document.getElementById('confirmarBtn');

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
    const anio = document.getElementById('anio').value.trim();
    const mes = document.getElementById('mes').value;
    if (!/^20\d{2}$/.test(anio) || !mes) {
      setMessage(message, 'Selecciona un año y un mes válidos.');
      (!anio ? document.getElementById('anio') : document.getElementById('mes')).focus();
      return;
    }
    setMessage(message, '', 'info');
    setBusy(submitButton, true, 'Generando extracto…');
    localStorage.setItem('filtrosExtracto', JSON.stringify({ anio, mes }));
    window.location.href = '/screens/resultExtracto.html';
  });
});
