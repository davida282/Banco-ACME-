import { emailFrom as sender, resendApiKey as resendKey } from './config.js';

export function recoveryEmailConfigured() {
  return Boolean(resendKey && sender);
}

export async function sendPasswordRecoveryEmail({ to, resetUrl }) {
  if (!recoveryEmailConfigured()) throw new Error('Servicio de correo no configurado.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender,
      to: [to],
      subject: 'Restablece tu contraseña de Banco ACME',
      html: `<p>Solicitaste restablecer tu contraseña.</p><p><a href="${resetUrl}">Crear una nueva contraseña</a></p><p>El enlace vence en 15 minutos y solo puede usarse una vez.</p>`,
    }),
  });
  if (!response.ok) throw new Error('El proveedor de correo rechazó el envío.');
}
