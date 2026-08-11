ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'usuario';

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('usuario', 'superusuario'));

UPDATE usuarios
SET rol = 'superusuario'
WHERE documento = '1097497861';

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado_unique
  ON usuarios (LOWER(email));

CREATE TABLE IF NOT EXISTS sesiones (
  id UUID PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TIMESTAMPTZ NOT NULL,
  revocada_en TIMESTAMPTZ,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash VARCHAR(64),
  agente_usuario VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario_activa
  ON sesiones (usuario_id, expira_en)
  WHERE revocada_en IS NULL;

CREATE TABLE IF NOT EXISTS tokens_recuperacion_contrasena (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_en TIMESTAMPTZ NOT NULL,
  usado_en TIMESTAMPTZ,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_recuperacion_activos
  ON tokens_recuperacion_contrasena (usuario_id, expira_en)
  WHERE usado_en IS NULL;
