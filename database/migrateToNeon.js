import 'dotenv/config';
import pg from 'pg';
import { pool as sourcePool } from '../server/db.js';

function normalizeSecureDatabaseUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

const targetUrl = normalizeSecureDatabaseUrl(process.env.TARGET_DATABASE_URL);

if (!targetUrl) {
  throw new Error('TARGET_DATABASE_URL es obligatoria. No la guardes en archivos versionados.');
}

const targetPool = new pg.Pool({
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: true },
});

const tables = [
  {
    name: 'usuarios',
    columns: ['id', 'numero_cuenta', 'tipo_documento', 'documento', 'nombres', 'apellidos', 'email', 'telefono', 'direccion', 'ciudad', 'genero', 'password_hash', 'saldo', 'creado_en', 'rol', 'estado', 'desactivada_en', 'desactivada_por_id', 'motivo_estado'],
  },
  {
    name: 'transacciones',
    columns: ['id', 'usuario_id', 'cuenta_destino_id', 'referencia', 'tipo', 'concepto', 'valor', 'fecha', 'estado', 'clave_idempotencia', 'servicio_codigo', 'referencia_servicio', 'empresa_servicio'],
  },
  {
    name: 'prestamos',
    columns: ['id', 'usuario_id', 'transaccion_id', 'referencia', 'monto', 'plazo_meses', 'tasa_mensual', 'intereses', 'total_pagar', 'cuota_mensual', 'estado', 'creado_en'],
  },
  {
    name: 'auditoria_administrativa',
    columns: ['id', 'administrador_id', 'usuario_afectado_id', 'transaccion_id', 'accion', 'motivo', 'detalle', 'creada_en'],
  },
  {
    name: 'schema_migrations',
    columns: ['nombre', 'ejecutada_en'],
  },
];

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function getCounts(connection) {
  const counts = {};
  for (const { name } of tables) {
    const { rows } = await connection.query(`SELECT COUNT(*)::int AS total FROM ${quoteIdentifier(name)}`);
    counts[name] = rows[0].total;
  }
  return counts;
}

async function copyTable(client, spec, sourceRows) {
  if (!sourceRows.length) return;

  const columns = spec.columns.map(quoteIdentifier).join(', ');
  const values = [];
  const placeholders = sourceRows.map((row, rowIndex) => {
    const current = spec.columns.map((column, columnIndex) => {
      values.push(row[column]);
      return `$${rowIndex * spec.columns.length + columnIndex + 1}`;
    });
    return `(${current.join(', ')})`;
  });

  await client.query(
    `INSERT INTO ${quoteIdentifier(spec.name)} (${columns}) VALUES ${placeholders.join(', ')}`,
    values,
  );
}

try {
  const [sourceCounts, targetCounts] = await Promise.all([getCounts(sourcePool), getCounts(targetPool)]);
  const occupiedTables = Object.entries(targetCounts).filter(([, total]) => total > 0);
  if (occupiedTables.length) {
    throw new Error(`El destino no está vacío: ${occupiedTables.map(([table, total]) => `${table}=${total}`).join(', ')}.`);
  }

  const sourceData = {};
  for (const spec of tables) {
    const columns = spec.columns.map(quoteIdentifier).join(', ');
    const { rows } = await sourcePool.query(`SELECT ${columns} FROM ${quoteIdentifier(spec.name)} ORDER BY 1`);
    sourceData[spec.name] = rows;
  }

  const deactivationRelations = sourceData.usuarios
    .filter((user) => user.desactivada_por_id !== null)
    .map((user) => ({ id: user.id, deactivatedBy: user.desactivada_por_id }));
  for (const user of sourceData.usuarios) user.desactivada_por_id = null;

  const client = await targetPool.connect();
  try {
    await client.query('BEGIN');
    for (const spec of tables) await copyTable(client, spec, sourceData[spec.name]);
    for (const relation of deactivationRelations) {
      await client.query('UPDATE usuarios SET desactivada_por_id=$2 WHERE id=$1', [relation.id, relation.deactivatedBy]);
    }

    await client.query("SELECT setval(pg_get_serial_sequence('usuarios', 'id'), COALESCE((SELECT MAX(id) FROM usuarios), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('transacciones', 'id'), COALESCE((SELECT MAX(id) FROM transacciones), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('prestamos', 'id'), COALESCE((SELECT MAX(id) FROM prestamos), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('tokens_recuperacion_contrasena', 'id'), COALESCE((SELECT MAX(id) FROM tokens_recuperacion_contrasena), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('auditoria_administrativa', 'id'), COALESCE((SELECT MAX(id) FROM auditoria_administrativa), 1), true)");
    await client.query("SELECT setval('usuarios_numero_cuenta_seq', COALESCE((SELECT MAX(numero_cuenta::BIGINT) FROM usuarios), 1000000000000000), true)");
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const copiedCounts = await getCounts(targetPool);
  for (const table of tables) {
    if (sourceCounts[table.name] !== copiedCounts[table.name]) {
      throw new Error(`La validación de ${table.name} falló: origen=${sourceCounts[table.name]}, destino=${copiedCounts[table.name]}.`);
    }
  }

  console.log('Migración a Neon completada y validada.');
  console.table(copiedCounts);
} finally {
  await Promise.allSettled([sourcePool.end(), targetPool.end()]);
}
