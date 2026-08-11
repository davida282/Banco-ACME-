import 'dotenv/config';
import { access } from 'node:fs/promises';
import { resolvePostgresTool, runCommand } from './postgresTools.js';

const backupFile = process.argv[2];
if (!backupFile) throw new Error('Indica el archivo .dump. Ejemplo: npm.cmd run db:verify-backup -- "backups/Acme-Bank-2026-08-07.dump"');
await access(backupFile);

const pgRestore = await resolvePostgresTool('pg_restore');
await runCommand(pgRestore, ['--list', backupFile]);
console.log(`Respaldo válido y legible: ${backupFile}`);
