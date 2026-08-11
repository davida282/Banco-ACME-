# Operación de PostgreSQL

## Inspección

Consulta tamaño, tablas, índices y migraciones aplicadas:

```powershell
npm.cmd run db:inspect
```

## Crear un respaldo

El respaldo se crea en `backups/` con formato personalizado de PostgreSQL (`.dump`). Ese formato permite verificar y restaurar con `pg_restore`.

```powershell
npm.cmd run db:backup
```

También puedes elegir otra carpeta:

```powershell
npm.cmd run db:backup -- "D:\Respaldos\BancoACME"
```

## Verificar un respaldo

Hazlo siempre después de crearlo:

```powershell
npm.cmd run db:verify-backup -- "backups\Acme-Bank-fecha.dump"
```

## Restaurar un respaldo

> Restaurar puede reemplazar datos. Hazlo solamente sobre una base de pruebas o después de crear un respaldo nuevo de la base destino.

Con PostgreSQL instalado y `pg_restore` disponible, crea primero una base vacía y ejecútalo desde PowerShell:

```powershell
pg_restore --host localhost --port 5432 --username postgres --dbname "Acme Bank" --clean --if-exists --no-owner --no-privileges "backups\Acme-Bank-fecha.dump"
```

Si PowerShell no reconoce `pg_dump` o `pg_restore`, instala las herramientas de línea de comandos de PostgreSQL o agrega sus rutas completas en `.env`:

```env
PG_DUMP_PATH=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
PG_RESTORE_PATH=C:\Program Files\PostgreSQL\18\bin\pg_restore.exe
```

Nunca guardes respaldos dentro de Git ni compartas tu `.env`.
