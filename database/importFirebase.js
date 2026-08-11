import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const sourceFile = process.argv[2];

if (!process.env.PGPASSWORD) {
  throw new Error('Falta PGPASSWORD. Crea .env a partir de .env.example.');
}

if (!sourceFile) {
  throw new Error('Uso: npm run migrate:firebase -- "RUTA_AL_EXPORT_DE_FIREBASE.json"');
}

const data = JSON.parse(await readFile(resolve(sourceFile), 'utf8'));
const users = Object.values(data.usuarios ?? {});
const transactionsByAccount = data.transacciones ?? {};
const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
const client = await pool.connect();

const targetAccount = (concept = '') => {
  const match = concept.match(/cuenta\s+(\d{16})/i);
  return match?.[1] ?? null;
};

try {
  await client.query('BEGIN');

  for (const user of users) {
    const passwordHash = await bcrypt.hash(String(user.contrasena), 12);
    await client.query(
      `INSERT INTO usuarios (
        numero_cuenta, tipo_documento, documento, nombres, apellidos, email,
        telefono, direccion, ciudad, genero, password_hash, saldo, creado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (numero_cuenta) DO UPDATE SET
        tipo_documento = EXCLUDED.tipo_documento,
        documento = EXCLUDED.documento,
        nombres = EXCLUDED.nombres,
        apellidos = EXCLUDED.apellidos,
        email = EXCLUDED.email,
        telefono = EXCLUDED.telefono,
        direccion = EXCLUDED.direccion,
        ciudad = EXCLUDED.ciudad,
        genero = EXCLUDED.genero,
        saldo = EXCLUDED.saldo,
        creado_en = EXCLUDED.creado_en`,
      [
        String(user.numeroCuenta), user.tipoDocumento, String(user.documento),
        user.nombres, user.apellidos, user.email, String(user.telefono),
        user.direccion, user.ciudad, user.genero, passwordHash, user.saldo,
        user.fechaCreacion,
      ],
    );
  }

  const accountResult = await client.query('SELECT id, numero_cuenta FROM usuarios');
  const accountIds = new Map(accountResult.rows.map(({ id, numero_cuenta }) => [String(numero_cuenta), id]));

  for (const [sourceAccount, entries] of Object.entries(transactionsByAccount)) {
    const userId = accountIds.get(sourceAccount);
    if (!userId) throw new Error(`No existe el usuario de la cuenta ${sourceAccount}.`);

    for (const transaction of Object.values(entries)) {
      const destinationAccount = targetAccount(transaction.concepto);
      await client.query(
        `INSERT INTO transacciones (
          usuario_id, cuenta_destino_id, referencia, tipo, concepto, valor, fecha
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (referencia) DO NOTHING`,
        [
          userId,
          destinationAccount ? accountIds.get(destinationAccount) ?? null : null,
          String(transaction.referencia), transaction.tipo, transaction.concepto,
          transaction.valor, transaction.fecha,
        ],
      );
    }
  }

  await client.query('COMMIT');
  console.log(`Migración completada: ${users.length} usuarios y transacciones importadas.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
