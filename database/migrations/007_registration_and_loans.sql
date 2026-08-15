-- El documento sigue siendo la identidad única del cliente.
-- Correo y teléfono se conservan como datos de contacto, pero pueden repetirse.
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_email_key,
  DROP CONSTRAINT IF EXISTS usuarios_telefono_key;

DROP INDEX IF EXISTS usuarios_email_normalizado_unique;

CREATE INDEX IF NOT EXISTS usuarios_email_normalizado_idx
  ON usuarios (LOWER(email));

CREATE TABLE IF NOT EXISTS prestamos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id BIGINT NOT NULL UNIQUE REFERENCES transacciones(id) ON DELETE RESTRICT,
  referencia VARCHAR(100) NOT NULL UNIQUE,
  monto NUMERIC(15, 2) NOT NULL CHECK (monto >= 50000 AND monto <= 5000000 AND monto = TRUNC(monto)),
  plazo_meses SMALLINT NOT NULL CHECK (plazo_meses IN (3, 6, 12)),
  tasa_mensual NUMERIC(6, 4) NOT NULL CHECK (tasa_mensual = 0.0150),
  intereses NUMERIC(15, 2) NOT NULL CHECK (intereses >= 0 AND intereses = TRUNC(intereses)),
  total_pagar NUMERIC(15, 2) NOT NULL CHECK (total_pagar >= monto AND total_pagar = TRUNC(total_pagar)),
  cuota_mensual NUMERIC(15, 2) NOT NULL CHECK (cuota_mensual > 0 AND cuota_mensual = TRUNC(cuota_mensual)),
  estado VARCHAR(20) NOT NULL DEFAULT 'desembolsado' CHECK (estado IN ('desembolsado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prestamos_usuario_fecha_idx
  ON prestamos (usuario_id, creado_en DESC);

COMMENT ON TABLE prestamos IS
  'Préstamos ficticios de la demostración Banco ACME; no representan créditos reales.';
