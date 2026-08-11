import 'dotenv/config';
import { pool } from '../server/db.js';

const [database, tables, indexes, migrations] = await Promise.all([
  pool.query("SELECT current_database() AS nombre, pg_size_pretty(pg_database_size(current_database())) AS tamano"),
  pool.query(`SELECT relname AS tabla, n_live_tup AS filas_estimadas, pg_size_pretty(pg_total_relation_size(relid)) AS tamano
              FROM pg_stat_user_tables
              WHERE schemaname='public'
              ORDER BY pg_total_relation_size(relid) DESC`),
  pool.query(`SELECT tablename AS tabla, indexname AS indice, indexdef AS definicion
              FROM pg_indexes
              WHERE schemaname='public'
              ORDER BY tablename, indexname`),
  pool.query('SELECT nombre, ejecutada_en FROM schema_migrations ORDER BY nombre'),
]);

console.log('Base de datos:');
console.table(database.rows);
console.log('Tablas:');
console.table(tables.rows);
console.log('Índices:');
console.table(indexes.rows);
console.log('Migraciones aplicadas:');
console.table(migrations.rows);

await pool.end();
