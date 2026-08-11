-- Índices para las consultas administrativas y futuros filtros del historial.
-- Se crean con IF NOT EXISTS para que la migración sea segura al ejecutarse una sola vez.

CREATE INDEX IF NOT EXISTS usuarios_estado_creado_en_idx
  ON usuarios (estado, creado_en DESC);

CREATE INDEX IF NOT EXISTS transacciones_usuario_tipo_fecha_idx
  ON transacciones (usuario_id, tipo, fecha DESC);

CREATE INDEX IF NOT EXISTS auditoria_administrador_fecha_idx
  ON auditoria_administrativa (administrador_id, creada_en DESC);
