import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { connectionArguments, resolvePostgresTool, runCommand } from './postgresTools.js';

const backupDir = path.resolve(process.argv[2] ?? 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const databaseName = (process.env.PGDATABASE ?? 'Acme Bank').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const backupFile = path.join(backupDir, `${databaseName}-${timestamp}.dump`);

await mkdir(backupDir, { recursive: true });
const pgDump = await resolvePostgresTool('pg_dump');
await runCommand(pgDump, [
  ...connectionArguments(),
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  '--file', backupFile,
]);

console.log(`Respaldo creado: ${backupFile}`);
console.log('Verifícalo con: npm.cmd run db:verify-backup -- "ruta-del-respaldo.dump"');
