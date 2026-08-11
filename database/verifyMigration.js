import 'dotenv/config';
import pg from 'pg';

if (!process.env.PGPASSWORD) {
  throw new Error('Falta PGPASSWORD. Crea .env a partir de .env.example.');
}

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
const { rows } = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM usuarios) AS usuarios,
    (SELECT COUNT(*) FROM transacciones) AS transacciones,
    (SELECT COALESCE(SUM(saldo), 0) FROM usuarios) AS saldo_total,
    (SELECT COUNT(*) FROM usuarios WHERE password_hash LIKE '$2%') AS passwords_bcrypt,
    (SELECT COUNT(*) FROM transacciones WHERE cuenta_destino_id IS NOT NULL) AS transferencias_con_destino
`);
console.table(rows);
await pool.end();
