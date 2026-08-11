ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'activa',
  ADD COLUMN IF NOT EXISTS desactivada_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS desactivada_por_id BIGINT REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_estado VARCHAR(255);

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_estado_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_estado_check CHECK (estado IN ('activa', 'desactivada'));

ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'APROBADA',
  ADD COLUMN IF NOT EXISTS clave_idempotencia VARCHAR(100);

ALTER TABLE transacciones
  DROP CONSTRAINT IF EXISTS transacciones_estado_check;

ALTER TABLE transacciones
  ADD CONSTRAINT transacciones_estado_check CHECK (estado = 'APROBADA');

CREATE UNIQUE INDEX IF NOT EXISTS transacciones_idempotencia_usuario_unique
  ON transacciones (usuario_id, clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

CREATE INDEX IF NOT EXISTS transacciones_extracto_usuario_fecha_idx
  ON transacciones (usuario_id, fecha DESC);

CREATE INDEX IF NOT EXISTS transacciones_extracto_destino_fecha_idx
  ON transacciones (cuenta_destino_id, fecha DESC)
  WHERE cuenta_destino_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auditoria_administrativa (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  administrador_id BIGINT NOT NULL REFERENCES usuarios(id),
  usuario_afectado_id BIGINT REFERENCES usuarios(id),
  transaccion_id BIGINT REFERENCES transacciones(id),
  accion VARCHAR(50) NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auditoria_administrativa_fecha_idx
  ON auditoria_administrativa (creada_en DESC);

CREATE INDEX IF NOT EXISTS auditoria_administrativa_usuario_idx
  ON auditoria_administrativa (usuario_afectado_id, creada_en DESC);
