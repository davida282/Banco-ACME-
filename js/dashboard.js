import { api, clearSession, currentUser, formatMoney } from './api.js';
import { setBusy, setMessage, setRegionBusy } from './ui.js';

const dashboard = document.querySelector('.dashboard-shell');
const dashboardMessage = document.getElementById('dashboardMessage');
const logoutButton = document.getElementById('cerrarSesion');

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await currentUser();
    document.getElementById('welcome').textContent = `Bienvenido de nuevo, ${user.nombres}`;
    document.getElementById('account-title').textContent = `${user.nombres} ${user.apellidos}`;
    document.getElementById('accountNumber').textContent = user.numeroCuenta;
    document.getElementById('createdDate').textContent = new Date(user.fechaCreacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('balance').textContent = formatMoney(user.saldo);
    if (user.rol === 'superusuario') {
      const action = document.createElement('a');
      action.className = 'accion accent';
      action.href = '/html/superusuario.html';
      const title = document.createElement('span'); title.textContent = 'Control administrativo';
      const description = document.createElement('small'); description.textContent = 'Gestiona usuarios, saldos y auditoría';
      action.append(title, description);
      document.querySelector('.acciones').appendChild(action);
    }
    setMessage(dashboardMessage, '', 'info');
  } catch (error) { setMessage(dashboardMessage, error.message || 'No fue posible cargar la información de tu cuenta.'); }
  finally { setRegionBusy(dashboard, false); }
});

logoutButton.addEventListener('click', async () => {
  setBusy(logoutButton, true, 'Cerrando sesión…');
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* La sesión puede haber vencido. */ }
  clearSession();
  window.location.replace('/html/login.html');
});
