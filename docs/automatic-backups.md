# Copias de seguridad automáticas

La base de datos de producción mantiene un snapshot rotativo en Neon mediante una tarea programada de Vercel.

## Configuración activa

- Frecuencia: diaria a las 08:00 UTC (03:00 en Colombia).
- Retención: hasta 7 días si la programación se detiene.
- Plan gratuito: Neon permite una sola copia; cada ejecución reemplaza el snapshot anterior por uno nuevo.
- Ruta interna: `/api/cron/neon-backup`.
- Protección: la ruta exige el secreto `CRON_SECRET`; una petición pública recibe `401`.

Vercel envía la autorización de la tarea automáticamente. Las variables `NEON_API_KEY` y `CRON_SECRET` son secretas y solo están almacenadas en Vercel.

## Restaurar una copia

1. Consulta las copias disponibles:

```powershell
npx.cmd neon snapshots list --project-id lingering-dew-17700521
```

2. Restaura primero hacia una rama nueva para revisarla, sin tocar producción:

```powershell
npx.cmd neon snapshots restore <id-del-snapshot> --project-id lingering-dew-17700521 --name recuperacion
```

No finalices una restauración sobre `main` sin validar antes la rama recuperada.

## Límite del plan gratuito

No crees snapshots manuales adicionales mientras esta rotación esté activa: el límite de una copia impediría la siguiente ejecución automática. Si se requiere más historial o copias independientes, habrá que usar un plan superior o almacenamiento externo.
