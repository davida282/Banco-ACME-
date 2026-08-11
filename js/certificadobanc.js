import { api, currentUser } from './api.js';
import { setMessage, setRegionBusy } from './ui.js';

const certificate = document.querySelector('.certificate-page .container');
const certificateMessage = document.getElementById('mensajeCertificado');

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await currentUser();
    const { user } = await api('/certificate');
    setMessage(certificateMessage, `BANCO ACME se permite informar que ${`${user.nombres} ${user.apellidos}`.toUpperCase()}, identificado con ${user.tipoDocumento} ${user.documento}, tiene con el banco los siguientes productos:`, 'info');
    document.getElementById('numeroCuenta').textContent = user.numeroCuenta;
    document.getElementById('fechaApertura').textContent = new Date(user.fechaCreacion).toLocaleDateString('es-CO');
  } catch (error) { if (error.message) setMessage(certificateMessage, error.message); }
  finally { setRegionBusy(certificate, false); }
});
document.getElementById('volver').addEventListener('click', () => { window.location.href = '/html/dashboard.html'; });
document.getElementById('imprimir').addEventListener('click', () => window.print());
