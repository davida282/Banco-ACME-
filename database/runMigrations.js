import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from '../server/db.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  nombre VARCHAR(255) PRIMARY KEY,
  ejecutada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);

for (const file of files) {
  const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE nombre=$1', [file]);
  if (alreadyApplied.rowCount) continue;
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  await withTransaction(async (client) => {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [file]);
  });
  console.log(`Migración aplicada: ${file}`);
}

await pool.end();
