# Preparación de secretos para producción

No copies valores de `.env` al repositorio, a mensajes ni a la documentación. Los secretos se crean y se guardan directamente en la plataforma de despliegue.

## Variables requeridas

| Variable | Producción | Uso |
| --- | --- | --- |
| `NODE_ENV` | `production` | Activa cookies seguras, HSTS y límites de solicitudes. |
| `APP_ORIGIN` | Sí | URL pública HTTPS, por ejemplo `https://tu-dominio.com`. |
| `DATABASE_URL` | Sí | Conexión PostgreSQL externa con verificación completa de TLS. |
| `DATABASE_SSL` | Sí | Usa `true` con una base de datos externa. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Sí | Mantén `true` salvo indicación documentada del proveedor. |
| `JWT_SECRET` | Sí | Secreto aleatorio de al menos 32 caracteres. |
| `RESEND_API_KEY` | Sí, si se habilita recuperación | Clave del proveedor de correo. |
| `EMAIL_FROM` | Sí, si se habilita recuperación | Remitente verificado, por ejemplo `Banco ACME <no-reply@tu-dominio.com>`. |

## Variables locales

Para desarrollo local se usan `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. En producción se usa exclusivamente `DATABASE_URL`.

## Antes de publicar

1. Genera un `JWT_SECRET` nuevo y exclusivo para producción.
2. Configura `APP_ORIGIN` con una URL HTTPS final o temporal.
3. No concedas a entornos preview acceso a la base de producción.
4. Configura el correo de recuperación antes de abrir el registro público.
5. Comprueba `GET /api/health`: debe responder `status: ok` y `database: connected`.
