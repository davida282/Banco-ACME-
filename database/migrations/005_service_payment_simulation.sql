ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS servicio_codigo VARCHAR(30),
  ADD COLUMN IF NOT EXISTS referencia_servicio VARCHAR(30),
  ADD COLUMN IF NOT EXISTS empresa_servicio VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS transacciones_servicio_factura_usuario_unique
  ON transacciones (usuario_id, servicio_codigo, referencia_servicio)
  WHERE servicio_codigo IS NOT NULL AND referencia_servicio IS NOT NULL;

CREATE INDEX IF NOT EXISTS transacciones_servicio_consulta_idx
  ON transacciones (usuario_id, servicio_codigo, referencia_servicio, fecha DESC)
  WHERE servicio_codigo IS NOT NULL;
