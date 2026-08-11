# Despliegue en Vercel

La aplicación Banco ACME está publicada en Vercel. El servidor Express se ejecuta como una función Node.js mediante el punto de entrada `server.js`; `npm.cmd start` continúa siendo el comando para desarrollo local.

## URL pública

https://banco-acme-chi.vercel.app

## Variables de producción

Las variables se almacenan en Vercel, no en el repositorio:

- `NODE_ENV=production`
- `APP_ORIGIN=https://banco-acme-chi.vercel.app`
- `DATABASE_URL` (secreta, obtenida desde Neon)
- `DATABASE_SSL=true`
- `DATABASE_SSL_REJECT_UNAUTHORIZED=true`
- `JWT_SECRET` (secreta y exclusiva para producción)
- `NEON_API_KEY` y `CRON_SECRET` (secretas, para el respaldo rotativo)

## Comprobación posterior al despliegue

La ruta `https://banco-acme-chi.vercel.app/api/health` debe responder con `status: ok` y `database: connected`.

## Publicar una actualización

Desde la raíz del proyecto y con sesión iniciada en Vercel:

```powershell
npx.cmd vercel --prod --yes
```

Antes de publicar, ejecuta `npm.cmd test`. Para revisar un despliegue usa `npx.cmd vercel inspect <url-del-despliegue>`.

La programación de respaldo se describe en `docs/automatic-backups.md`.
