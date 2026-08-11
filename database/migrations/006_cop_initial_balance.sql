ALTER TABLE usuarios
  ALTER COLUMN saldo SET DEFAULT 500000;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_saldo_cop_entero_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_saldo_cop_entero_check
  CHECK (saldo = TRUNC(saldo));

ALTER TABLE transacciones
  DROP CONSTRAINT IF EXISTS transacciones_valor_cop_entero_check;

ALTER TABLE transacciones
  ADD CONSTRAINT transacciones_valor_cop_entero_check
  CHECK (valor = TRUNC(valor));

COMMENT ON COLUMN usuarios.saldo IS
  'Saldo de la cuenta expresado en pesos colombianos (COP).';

COMMENT ON COLUMN transacciones.valor IS
  'Valor de la transacción expresado en pesos colombianos (COP).';
