import { api, formatMoney } from './api.js';
import { setBusy, setMessage } from './ui.js';

const form = document.getElementById('registroForm');
const message = document.getElementById('formMessage');
const submitButton = form.querySelector('button[type="submit"]');
const ids = ['tipoDoc', 'documento', 'nombres', 'apellidos', 'genero', 'email', 'telefono', 'direccion', 'ciudad', 'contrasena', 'confirmarContrasena'];
const fields = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const namePattern = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[\s'-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setFieldMessage(id, text = '', valid = false) {
  const input = fields[id];
  const output = document.getElementById(`${id}Error`);
  if (!input || !output) return;
  output.textContent = text;
  output.classList.toggle('valid', valid && Boolean(text));
  input.setAttribute('aria-invalid', text && !valid ? 'true' : 'false');
}

function passwordError(value) {
  if (value.length < 8) return 'Usa mínimo 8 caracteres.';
  return '';
}

function validateField(id) {
  const value = fields[id].value.trim();
  let error = '';
  if (id === 'tipoDoc' || id === 'genero' || id === 'ciudad') error = value ? '' : 'Selecciona una opción.';
  if (id === 'documento' || id === 'telefono') error = /^\d{10}$/.test(value) ? '' : 'Debe tener exactamente 10 dígitos.';
  if (id === 'nombres' || id === 'apellidos') error = namePattern.test(value) && value.length >= 2 && value.length <= 40 ? '' : 'Usa entre 2 y 40 letras, espacios, apóstrofes o guiones.';
  if (id === 'email') error = value.length <= 254 && emailPattern.test(value) ? '' : 'Escribe un correo electrónico válido.';
  if (id === 'direccion') error = value.length >= 6 && value.length <= 255 ? '' : 'La dirección debe tener entre 6 y 255 caracteres.';
  if (id === 'contrasena') error = passwordError(fields.contrasena.value);
  if (id === 'confirmarContrasena') error = fields.confirmarContrasena.value === fields.contrasena.value && fields.confirmarContrasena.value ? '' : 'Las contraseñas deben coincidir.';
  setFieldMessage(id, error);
  return !error;
}

for (const id of ['documento', 'telefono']) fields[id].addEventListener('input', (event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10); validateField(id); });
for (const id of ['nombres', 'apellidos']) fields[id].addEventListener('input', (event) => { event.target.value = event.target.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'-]/g, ''); validateField(id); });
for (const id of ids.filter((id) => !['documento', 'telefono', 'nombres', 'apellidos'].includes(id))) fields[id].addEventListener('blur', () => validateField(id));
fields.contrasena.addEventListener('input', () => { validateField('contrasena'); if (fields.confirmarContrasena.value) validateField('confirmarContrasena'); });
fields.confirmarContrasena.addEventListener('input', () => validateField('confirmarContrasena'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(message, '', 'error');
  const valid = ids.map(validateField).every(Boolean);
  if (!valid) { setMessage(message, 'Revisa los campos marcados antes de continuar.'); form.querySelector('[aria-invalid="true"]')?.focus(); return; }
  const data = {
    tipoDocumento: fields.tipoDoc.value, genero: fields.genero.value, ciudad: fields.ciudad.value,
    documento: fields.documento.value.trim(), telefono: fields.telefono.value.trim(), nombres: fields.nombres.value.trim(),
    apellidos: fields.apellidos.value.trim(), direccion: fields.direccion.value.trim(), contrasena: fields.contrasena.value,
    email: fields.email.value.trim(),
  };
  setBusy(submitButton, true, 'Creando cuenta…');
  try {
    const { user } = await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    setMessage(message, `Cuenta creada con ${formatMoney(user.saldo)}. Te llevaremos al inicio de sesión.`, 'success');
    form.reset();
    setTimeout(() => window.location.replace('/?registro=exitoso'), 1200);
  } catch (error) { setMessage(message, error.message); }
  finally { setBusy(submitButton, false); }
});
