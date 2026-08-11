CREATE SEQUENCE IF NOT EXISTS usuarios_numero_cuenta_seq
  AS BIGINT
  START WITH 1000000000000001;

SELECT setval(
  'usuarios_numero_cuenta_seq',
  COALESCE((SELECT MAX(numero_cuenta::BIGINT) FROM usuarios), 1000000000000000),
  true
);
