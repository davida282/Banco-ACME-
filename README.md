# Banco ACME

Aplicación web demostrativa de autogestión bancaria. El proyecto simula el flujo de un banco digital con registro, autenticación, consulta de saldo, transferencias entre cuentas, retiros, pagos de servicios, extractos, certificados y un panel de superusuario.

La aplicación está construida con HTML, CSS y JavaScript en el cliente, una API de Node.js/Express y PostgreSQL administrado en Neon. No utiliza Firebase en producción y no procesa dinero ni recibos reales.

## Demo pública

Puedes probar la aplicación en:

**[Abrir Banco ACME](https://banco-acme-chi.vercel.app)**

La demo es un proyecto de portafolio. No introduzcas contraseñas, documentos ni información bancaria real.

## Funcionalidades

- Registro de cuentas con documento único, saldo inicial y redirección automática al inicio de sesión.
- Correo y teléfono tratados como datos de contacto reutilizables; el documento identifica de forma única cada cuenta.
- Inicio y cierre de sesión mediante correo electrónico.
- Contraseñas de mínimo 8 caracteres almacenadas con prehash SHA-256 y bcrypt; nunca se guardan en texto plano.
- Sesiones protegidas mediante cookies `HttpOnly`, `SameSite` y revocación en PostgreSQL.
- Protección CSRF, límites de solicitudes, Helmet y política CSP.
- Saldo inicial simulado de **$ 500.000,00 COP** para nuevas cuentas.
- Consignaciones a cuentas activas seleccionadas por nombre y número de cuenta.
- Validación del saldo antes de abrir la confirmación de una consignación.
- Confirmación previa para consignaciones, retiros y pagos de servicios.
- Retiros con validación de saldo y monto mínimo.
- Catálogo ficticio de servicios: energía, agua, gas, internet, telefonía, televisión y administración.
- Estados simulados de factura: pendiente, pagada, no encontrada y vencida.
- Historial de movimientos paginado desde PostgreSQL.
- Extractos y certificados imprimibles, con acceso rápido al mes actual.
- Préstamos ficticios con cotización, plazo, intereses, cuota y desembolso inmediato para pruebas.
- Panel de superusuario para consultar, desactivar y reactivar cuentas y revisar auditoría.
- Copias de seguridad automáticas de Neon mediante Vercel Cron.
- Interfaz responsive con formato monetario colombiano (COP).

## Tecnologías

- Node.js 20 o superior
- Express 5
- PostgreSQL / Neon
- HTML5, CSS3 y JavaScript ES Modules
- `pg`, `bcryptjs`, `helmet`, `cookie-parser`, `express-rate-limit` y `jsonwebtoken`
- Vercel para el despliegue

## Estructura del proyecto

```text
html/        Pantallas principales de la aplicación
screens/     Pantallas funcionales de confirmación, resultados y recuperación
css/         Hojas de estilo por pantalla y sistema visual compartido
js/          Lógica de interfaz y llamadas a la API
server/      API Express, autenticación, seguridad, correo y acceso a PostgreSQL
database/    Migraciones, inspección, importación y respaldo de datos
docs/        Guías de operación, Neon, secretos y despliegue
imgs/        Recursos gráficos de la interfaz
test/        Pruebas automatizadas de operaciones bancarias
vercel.json  Tarea programada para respaldo automático
```

La carpeta `screens/` no es una maqueta descartable: contiene rutas que la aplicación utiliza actualmente. La antigua referencia externa de diseño fue retirada de este repositorio.

## Requisitos locales

- Node.js 20 o posterior.
- PostgreSQL 14 o posterior, o una base PostgreSQL de Neon.
- PowerShell en Windows (se recomienda usar `npm.cmd` si la política de scripts bloquea `npm`).

## Instalación local

1. Clona el repositorio y entra en la carpeta:

   ```powershell
   git clone https://github.com/davida282/Banco-ACME-.git
   cd Banco-ACME-
   ```

2. Instala las dependencias:

   ```powershell
   npm.cmd install
   ```

3. Copia `.env.example` como `.env` y completa únicamente los valores de tu entorno local. Nunca publiques `.env`.

4. Crea la base de datos y ejecuta las migraciones:

   ```powershell
   npm.cmd run migrate
   ```

5. Inicia el servidor:

   ```powershell
   npm.cmd start
   ```

6. Abre [http://localhost:3000](http://localhost:3000).

Para desarrollo con recarga automática:

```powershell
npm.cmd run dev
```

## Variables de entorno

La plantilla completa está en [`.env.example`](./.env.example). En desarrollo se pueden usar `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD`. En producción se utiliza `DATABASE_URL` con TLS.

Variables principales:

| Variable | Uso |
| --- | --- |
| `NODE_ENV` | Entorno de ejecución |
| `APP_ORIGIN` | URL pública utilizada para enlaces y cookies |
| `DATABASE_URL` | Conexión PostgreSQL de producción |
| `JWT_SECRET` | Secreto de sesiones, mínimo 32 caracteres |
| `DATABASE_SSL` | Activa TLS para PostgreSQL |
| `RESEND_API_KEY` / `EMAIL_FROM` | Recuperación real por correo, opcional |
| `NEON_API_KEY` / `NEON_PROJECT_ID` / `NEON_BRANCH_ID` | Respaldo automático de Neon |
| `CRON_SECRET` | Protege la ruta de respaldo programado |

No subas secretos al repositorio ni los escribas en issues, capturas o documentación.

## Base de datos y migraciones

Las migraciones se encuentran en [`database/migrations`](./database/migrations). Para aplicar las pendientes:

```powershell
npm.cmd run migrate
```

Comandos útiles:

```powershell
npm.cmd run db:inspect
npm.cmd run db:backup
npm.cmd run db:verify-backup
npm.cmd run verify:migration
```

La guía operativa está en [`docs/postgresql-operacion.md`](./docs/postgresql-operacion.md) y la configuración de Neon en [`docs/neon-database.md`](./docs/neon-database.md).

## API principal

- `POST /api/auth/register`, `/login`, `/logout`, `/recovery` y `/reset-password`
- `GET` y `PATCH /api/me`
- `GET /api/accounts/active`
- `GET /api/transactions`
- `POST /api/transactions/transfer`, `/withdraw` y `/service-payment`
- `GET /api/loans`, `POST /api/loans/quote` y `POST /api/loans`
- `GET /api/certificate`
- `GET /api/health`

Las operaciones que modifican datos requieren una sesión válida y protección CSRF. Las validaciones se repiten en el servidor; no se confía únicamente en el navegador.

## Pruebas

Ejecuta la suite disponible con:

```powershell
npm.cmd test
```

Antes de publicar cambios que afecten a la base de datos, aplica primero las migraciones en un entorno de prueba y verifica el flujo completo.

## Despliegue

El proyecto está desplegado en Vercel y conectado a PostgreSQL de Neon. Para publicar una nueva versión desde una copia autenticada:

```powershell
npx.cmd vercel --prod --yes
```

Las variables de producción deben configurarse en Vercel, no en el repositorio. Después de cada despliegue revisa:

- La URL pública y `/api/health`.
- Los logs y el estado `READY` del despliegue.
- El consumo del proyecto en Vercel y Neon.
- La creación del respaldo automático de Neon.

Guías adicionales:

- [`docs/production-secrets.md`](./docs/production-secrets.md)
- [`docs/vercel-deployment.md`](./docs/vercel-deployment.md)
- [`docs/automatic-backups.md`](./docs/automatic-backups.md)

## Alcance y limitaciones

Banco ACME es una simulación educativa para portafolio. Las empresas, facturas, saldos y transacciones son ficticios; no existe integración con bancos, redes de pago ni facturas reales. El panel de superusuario está pensado para demostración y pruebas controladas.

## Licencia

Proyecto académico y demostrativo. Consulta al propietario del repositorio antes de reutilizarlo o redistribuirlo.
