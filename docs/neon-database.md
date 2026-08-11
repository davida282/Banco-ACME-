# Base de datos de producción en Neon

El proyecto de producción se creó en Neon. La conexión se mantiene fuera del repositorio y debe administrarse desde la consola del proveedor.

## Uso en producción

1. En Neon, abre el proyecto Banco ACME - Producción y copia la cadena de conexión almacenada en **Connect**.
2. Registra esa cadena como `DATABASE_URL` en el proveedor de despliegue.
3. Define `NODE_ENV=production`, `DATABASE_SSL=true` y `DATABASE_SSL_REJECT_UNAUTHORIZED=true`.
4. No copies la URL de conexión a archivos versionados ni al código del navegador.

## Migración de datos

El comando `npm.cmd run db:migrate-neon` copia los registros persistentes desde PostgreSQL local hacia una base Neon vacía y compara los conteos al finalizar. Requiere que `TARGET_DATABASE_URL` exista solo durante la ejecución.

No transfiere sesiones ni tokens de recuperación: ambos deben empezar vacíos en producción.

## Verificación

Una vez configurada `DATABASE_URL` en el entorno de producción, consulta `/api/health`. Debe responder con estado `ok` y base de datos conectada.
