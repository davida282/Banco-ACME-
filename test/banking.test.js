import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import test, { after, before } from 'node:test';
import bcrypt from 'bcryptjs';
import { formatMoney } from '../js/api.js';

process.env.NODE_ENV = 'test';

let app;
let pool;
let server;
let baseUrl;
let temporaryUserId;
let temporaryUserAccount;
let temporaryRecipientId;
let temporaryRecipientAccount;
let temporaryRecipientEmail;
let temporaryAdminId;
let temporaryAdminEmail;
let administrativeTargetId;
let administrativeTargetEmail;
const registeredUserIds = [];

function cookiePairs(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]);
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

before(async () => {
  ({ default: app } = await import('../server/app.js'));
  ({ pool } = await import('../server/db.js'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const document = String(7_000_000_000 + crypto.randomInt(1_000_000));
  const account = String(8_000_000_000_000_000 + crypto.randomInt(1_000_000));
  temporaryUserAccount = account;
  const passwordHash = await bcrypt.hash('Temporal-prueba-2026!', 12);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (numero_cuenta,tipo_documento,documento,nombres,apellidos,email,telefono,direccion,ciudad,genero,password_hash,saldo,creado_en)
     VALUES ($1,'CC',$2,'Prueba','Temporal',$3,$2,'Pruebas automatizadas','Bogotá','No especificado',$4,500000,NOW()) RETURNING id`,
    [account, document, `test.${document}@acme.local`, passwordHash],
  );
  temporaryUserId = rows[0].id;

  const recipientDocument = String(7_100_000_000 + crypto.randomInt(1_000_000));
  temporaryRecipientAccount = String(8_100_000_000_000_000 + crypto.randomInt(1_000_000));
  temporaryRecipientEmail = `recipient.${recipientDocument}@acme.local`;
  const { rows: recipientRows } = await pool.query(
    `INSERT INTO usuarios (numero_cuenta,tipo_documento,documento,nombres,apellidos,email,telefono,direccion,ciudad,genero,password_hash,saldo,creado_en)
     VALUES ($1,'CC',$2,'Destino','Prueba',$3,$2,'Pruebas automatizadas','Bogotá','No especificado',$4,0,NOW()) RETURNING id`,
    [temporaryRecipientAccount, recipientDocument, temporaryRecipientEmail, passwordHash],
  );
  temporaryRecipientId = recipientRows[0].id;

  const adminDocument = String(7_200_000_000 + crypto.randomInt(1_000_000));
  const adminAccount = String(8_200_000_000_000_000 + crypto.randomInt(1_000_000));
  temporaryAdminEmail = `admin.${adminDocument}@acme.local`;
  const { rows: adminRows } = await pool.query(
    `INSERT INTO usuarios (numero_cuenta,tipo_documento,documento,nombres,apellidos,email,telefono,direccion,ciudad,genero,password_hash,saldo,creado_en,rol)
     VALUES ($1,'CC',$2,'Administración','Prueba',$3,$2,'Pruebas automatizadas','Bogotá','No especificado',$4,0,NOW(),'superusuario') RETURNING id`,
    [adminAccount, adminDocument, temporaryAdminEmail, passwordHash],
  );
  temporaryAdminId = adminRows[0].id;

  const targetDocument = String(7_300_000_000 + crypto.randomInt(1_000_000));
  const targetAccount = String(8_300_000_000_000_000 + crypto.randomInt(1_000_000));
  administrativeTargetEmail = `admin-target.${targetDocument}@acme.local`;
  const { rows: targetRows } = await pool.query(
    `INSERT INTO usuarios (numero_cuenta,tipo_documento,documento,nombres,apellidos,email,telefono,direccion,ciudad,genero,password_hash,saldo,creado_en)
     VALUES ($1,'CC',$2,'Cuenta','Desactivable',$3,$2,'Pruebas automatizadas','Bogotá','No especificado',$4,250000,NOW()) RETURNING id`,
    [targetAccount, targetDocument, administrativeTargetEmail, passwordHash],
  );
  administrativeTargetId = targetRows[0].id;
});

after(async () => {
  const temporaryIds = [temporaryUserId, temporaryRecipientId, temporaryAdminId, administrativeTargetId, ...registeredUserIds].filter(Boolean);
  if (temporaryIds.length) {
    await pool.query('DELETE FROM auditoria_administrativa WHERE usuario_afectado_id=ANY($1) OR administrador_id=ANY($1)', [temporaryIds]);
    await pool.query('DELETE FROM prestamos WHERE usuario_id=ANY($1)', [temporaryIds]);
    await pool.query('DELETE FROM transacciones WHERE usuario_id=ANY($1) OR cuenta_destino_id=ANY($1)', [temporaryIds]);
    await pool.query('DELETE FROM usuarios WHERE id=ANY($1)', [temporaryIds]);
  }
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('el estado de salud confirma que la aplicación y PostgreSQL están disponibles', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
});

test('los valores monetarios se presentan como pesos colombianos con signo y dos decimales', () => {
  assert.equal(formatMoney(1234.5).replace('\u00a0', ' '), '$ 1.234,50');
  assert.equal(formatMoney(0).replace('\u00a0', ' '), '$ 0,00');
});

test('extractos incluye el acceso rápido al mes actual y registro redirige al inicio de sesión', async () => {
  const [statementHtml, statementScript, registerScript] = await Promise.all([
    readFile(new URL('../html/extractoBancario.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/extractoBancario.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/register.js', import.meta.url), 'utf8'),
  ]);
  assert.match(statementHtml, /id="currentPeriodBtn"/);
  assert.match(statementScript, /getFullYear\(\)/);
  assert.match(statementScript, /getMonth\(\) \+ 1/);
  assert.match(registerScript, /window\.location\.replace\('\/\?registro=exitoso'\)/);
});

test('las pantallas públicas se sirven desde rutas limpias', async () => {
  const routes = ['/', '/login', '/registro', '/recuperar-contrasena', '/nueva-contrasena', '/dashboard', '/consignar', '/retirar', '/pagar-servicios', '/movimientos', '/extracto', '/extracto/resultado', '/certificado', '/prestamos', '/superusuario', '/consignacion-exitosa', '/retiro-exitoso', '/pago-exitoso'];
  const responses = await Promise.all(routes.map((route) => request(route)));
  responses.forEach((response) => assert.equal(response.status, 200));
});

test('la recuperación simulada cambia la contraseña una sola vez y protege al superusuario', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const headers = { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf };

  const recoveryResponse = await request('/api/auth/recovery', {
    method: 'POST', headers, body: JSON.stringify({ email: temporaryRecipientEmail }),
  });
  assert.equal(recoveryResponse.status, 201);
  const { resetToken } = await recoveryResponse.json();
  assert.ok(resetToken.length >= 40);

  const newPassword = 'Nueva-clave-demo-2026!';
  const resetResponse = await request('/api/auth/reset-password', {
    method: 'POST', headers, body: JSON.stringify({ resetToken, contrasena: newPassword }),
  });
  assert.equal(resetResponse.status, 204);

  const repeatedReset = await request('/api/auth/reset-password', {
    method: 'POST', headers, body: JSON.stringify({ resetToken, contrasena: 'Otra-clave-demo-2026!' }),
  });
  assert.equal(repeatedReset.status, 401);

  const loginResponse = await request('/api/auth/login', {
    method: 'POST', headers, body: JSON.stringify({ email: temporaryRecipientEmail, contrasena: newPassword }),
  });
  assert.equal(loginResponse.status, 200);

  const protectedRecovery = await request('/api/auth/recovery', {
    method: 'POST', headers, body: JSON.stringify({ email: temporaryAdminEmail }),
  });
  assert.equal(protectedRecovery.status, 403);
});

test('la automatización de respaldos rechaza peticiones públicas', async () => {
  const response = await request('/api/cron/neon-backup');
  assert.equal(response.status, 401);
});

test('una clave de idempotencia registra un retiro una sola vez', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  assert.equal(csrfResponse.status, 204);
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];

  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ email: `test.${await userDocument()}@acme.local`, contrasena: 'Temporal-prueba-2026!' }),
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = cookiePairs(loginResponse).find((value) => value.startsWith('acme_session='));
  assert.ok(sessionCookie);
  const cookies = `${csrfCookie}; ${sessionCookie}`;
  const deniedAdmin = await request('/api/admin/users', { headers: { Cookie: cookies } });
  assert.equal(deniedAdmin.status, 403);
  const key = crypto.randomUUID();
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf, 'Idempotency-Key': key },
    body: JSON.stringify({ valor: 10000 }),
  };
  const first = await request('/api/transactions/withdraw', options);
  const second = await request('/api/transactions/withdraw', options);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const firstTransaction = (await first.json()).transaction;
  const secondTransaction = (await second.json()).transaction;
  assert.equal(firstTransaction.referencia, secondTransaction.referencia);

  const { rows } = await pool.query('SELECT saldo, (SELECT COUNT(*)::int FROM transacciones WHERE usuario_id=$1 AND clave_idempotencia=$2) AS movimientos FROM usuarios WHERE id=$1', [temporaryUserId, key]);
  assert.equal(Number(rows[0].saldo), 490000);
  assert.equal(rows[0].movimientos, 1);
});

test('el registro solo rechaza contraseñas con menos de ocho caracteres', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const response = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({
      tipoDocumento: 'CC', genero: 'No especificado', ciudad: 'Bogotá', documento: '7999999999', telefono: '7999999999',
      nombres: 'Cliente', apellidos: 'Inseguro', direccion: 'Calle de prueba 123', email: 'inseguro@example.test', contrasena: 'corta7',
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /contraseña/i);
});

test('la consignación consulta el destinatario y no recibe su nombre desde el cliente', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ email: `test.${await userDocument()}@acme.local`, contrasena: 'Temporal-prueba-2026!' }),
  });
  const sessionCookie = cookiePairs(loginResponse).find((value) => value.startsWith('acme_session='));
  const cookies = `${csrfCookie}; ${sessionCookie}`;
  await pool.query("UPDATE usuarios SET estado='desactivada' WHERE id=$1", [administrativeTargetId]);
  const recipientsResponse = await request('/api/transfers/recipients', { headers: { Cookie: cookies } });
  await pool.query("UPDATE usuarios SET estado='activa' WHERE id=$1", [administrativeTargetId]);
  assert.equal(recipientsResponse.status, 200);
  const recipients = (await recipientsResponse.json()).recipients;
  assert.ok(recipients.some((recipient) => recipient.numeroCuenta === temporaryRecipientAccount && recipient.nombreCompleto === 'Destino Prueba'));
  assert.equal(recipients.some((recipient) => recipient.numeroCuenta === temporaryUserAccount), false);
  assert.equal(recipients.some((recipient) => recipient.nombreCompleto === 'Cuenta Desactivable'), false);

  const insufficientResponse = await request(
    `/api/transfers/recipient?numeroCuenta=${temporaryRecipientAccount}&valor=999999999`,
    { headers: { Cookie: cookies } },
  );
  assert.equal(insufficientResponse.status, 400);
  assert.equal((await insufficientResponse.json()).error, 'Saldo insuficiente');

  const recipientResponse = await request(
    `/api/transfers/recipient?numeroCuenta=${temporaryRecipientAccount}&valor=1000`,
    { headers: { Cookie: cookies } },
  );
  assert.equal(recipientResponse.status, 200);
  const recipientPayload = await recipientResponse.json();
  assert.equal(recipientPayload.recipient.nombreCompleto, 'Destino Prueba');
  assert.equal(recipientPayload.balance.disponible, 490000);
  assert.equal(recipientPayload.balance.restante, 489000);

  const transferResponse = await request('/api/transactions/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ numeroCuenta: temporaryRecipientAccount, valor: 1000 }),
  });
  assert.equal(transferResponse.status, 201);
  assert.equal((await transferResponse.json()).transaction.destinatario, 'Destino Prueba');
});

test('el catálogo simulado valida formatos, estados y evita pagar dos veces la misma factura', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ email: `test.${await userDocument()}@acme.local`, contrasena: 'Temporal-prueba-2026!' }),
  });
  const sessionCookie = cookiePairs(loginResponse).find((value) => value.startsWith('acme_session='));
  const cookies = `${csrfCookie}; ${sessionCookie}`;

  const catalogResponse = await request('/api/services/catalog', { headers: { Cookie: cookies } });
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.services.length, 7);
  assert.ok(catalog.services.some((service) => service.code === 'administracion'));

  const pendingResponse = await request('/api/services/invoice?servicio=agua&referencia=AGU-12345678', { headers: { Cookie: cookies } });
  assert.equal((await pendingResponse.json()).invoice.status, 'pendiente');
  const missingResponse = await request('/api/services/invoice?servicio=agua&referencia=AGU-00123456', { headers: { Cookie: cookies } });
  assert.equal((await missingResponse.json()).invoice.status, 'no_encontrada');
  const expiredResponse = await request('/api/services/invoice?servicio=agua&referencia=AGU-12345699', { headers: { Cookie: cookies } });
  assert.equal((await expiredResponse.json()).invoice.status, 'vencida');

  const paymentBody = JSON.stringify({ servicio: 'agua', referenciaServicio: 'AGU-12345678', valor: 10000 });
  const paymentResponse = await request('/api/transactions/service-payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() }, body: paymentBody,
  });
  assert.equal(paymentResponse.status, 201);
  assert.equal((await paymentResponse.json()).transaction.service.code, 'agua');

  const paidResponse = await request('/api/services/invoice?servicio=agua&referencia=AGU-12345678', { headers: { Cookie: cookies } });
  assert.equal((await paidResponse.json()).invoice.status, 'pagada');
  const repeatedPayment = await request('/api/transactions/service-payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() }, body: paymentBody,
  });
  assert.equal(repeatedPayment.status, 409);
});

test('los movimientos se consultan por páginas de diez registros y conservan el total', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ email: `test.${await userDocument()}@acme.local`, contrasena: 'Temporal-prueba-2026!' }),
  });
  const sessionCookie = cookiePairs(loginResponse).find((value) => value.startsWith('acme_session='));
  const cookies = `${csrfCookie}; ${sessionCookie}`;

  await Promise.all(Array.from({ length: 11 }, (_, index) => pool.query(
    `INSERT INTO transacciones (usuario_id, referencia, tipo, concepto, valor, fecha)
     VALUES ($1,$2,'Movimiento de prueba',$3,1000,NOW() - ($4 * INTERVAL '1 minute'))`,
    [temporaryUserId, String(6_000_000_000 + index), `Movimiento paginable ${index + 1}`, index],
  )));

  const firstPageResponse = await request('/api/transactions?page=1&limit=100', { headers: { Cookie: cookies } });
  assert.equal(firstPageResponse.status, 200);
  const firstPage = await firstPageResponse.json();
  assert.equal(firstPage.transactions.length, 10);
  assert.equal(firstPage.pagination.pageSize, 10);
  assert.ok(firstPage.pagination.total > 10);
  assert.equal(firstPage.pagination.hasNext, true);

  const secondPageResponse = await request('/api/transactions?page=2', { headers: { Cookie: cookies } });
  const secondPage = await secondPageResponse.json();
  assert.equal(secondPage.pagination.page, 2);
  assert.ok(secondPage.transactions.length >= 1 && secondPage.transactions.length <= 10);
  const firstReferences = new Set(firstPage.transactions.map((transaction) => transaction.referencia));
  assert.equal(secondPage.transactions.some((transaction) => firstReferences.has(transaction.referencia)), false);

  const currentDate = new Date();
  const filteredResponse = await request(`/api/transactions?year=${currentDate.getFullYear()}&month=${currentDate.getMonth() + 1}&page=1`, { headers: { Cookie: cookies } });
  const filteredPage = await filteredResponse.json();
  assert.equal(filteredPage.pagination.pageSize, 10);
  assert.ok(filteredPage.pagination.total >= 11);

  const lastPageResponse = await request('/api/transactions?page=999', { headers: { Cookie: cookies } });
  assert.equal((await lastPageResponse.json()).pagination.page, secondPage.pagination.totalPages);
  const invalidPageResponse = await request('/api/transactions?page=0', { headers: { Cookie: cookies } });
  assert.equal(invalidPageResponse.status, 400);
});

test('el registro acepta correo y teléfono repetidos, pero conserva el documento como único', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const firstDocument = String(7_800_000_000 + crypto.randomInt(500_000));
  const secondDocument = String(7_850_000_000 + crypto.randomInt(500_000));
  const sharedEmail = `registro.compartido.${firstDocument}@acme.local`;
  const sharedPhone = String(7_900_000_000 + crypto.randomInt(1_000_000));
  const commonData = {
    tipoDocumento: 'CC', genero: 'No especificado', ciudad: 'Bogotá', telefono: sharedPhone,
    nombres: 'Cliente', apellidos: 'Registrado', direccion: 'Calle de prueba 123', email: sharedEmail,
  };

  const firstResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ ...commonData, documento: firstDocument, contrasena: 'abcdefgh' }),
  });
  assert.equal(firstResponse.status, 201);
  const firstUser = (await firstResponse.json()).user;
  registeredUserIds.push(firstUser.id);
  assert.equal(firstUser.saldo, 500000);

  const secondResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ ...commonData, documento: secondDocument, contrasena: 'ijklmnop' }),
  });
  assert.equal(secondResponse.status, 201);
  const secondUser = (await secondResponse.json()).user;
  registeredUserIds.push(secondUser.id);
  assert.equal(secondUser.saldo, 500000);

  const duplicateDocumentResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({
      ...commonData,
      documento: firstDocument,
      telefono: String(Number(sharedPhone) + 1),
      email: `otro.${firstDocument}@acme.local`,
      contrasena: '12345678',
    }),
  });
  assert.equal(duplicateDocumentResponse.status, 409);
  assert.match((await duplicateDocumentResponse.json()).error, /documento/i);

  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ email: sharedEmail, contrasena: 'abcdefgh' }),
  });
  assert.equal(loginResponse.status, 200);
  assert.equal((await loginResponse.json()).user.id, firstUser.id);
});

test('los préstamos se cotizan, desembolsan una sola vez y aumentan el saldo', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  const csrfCookie = cookiePairs(csrfResponse).find((value) => value.startsWith('acme_csrf='));
  assert.ok(csrfCookie);
  const csrf = csrfCookie.split('=', 2)[1];
  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: csrfCookie, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ email: `test.${await userDocument()}@acme.local`, contrasena: 'Temporal-prueba-2026!' }),
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = cookiePairs(loginResponse).find((value) => value.startsWith('acme_session='));
  const cookies = `${csrfCookie}; ${sessionCookie}`;

  const invalidQuote = await request('/api/loans/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ monto: 49_999, plazoMeses: 6 }),
  });
  assert.equal(invalidQuote.status, 400);

  const quoteResponse = await request('/api/loans/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf },
    body: JSON.stringify({ monto: 100_000, plazoMeses: 6 }),
  });
  assert.equal(quoteResponse.status, 200);
  assert.deepEqual((await quoteResponse.json()).quote, {
    monto: 100000,
    plazoMeses: 6,
    tasaMensual: 0.015,
    intereses: 9000,
    totalPagar: 109000,
    cuotaMensual: 18167,
  });

  const { rows: balanceRows } = await pool.query('SELECT saldo FROM usuarios WHERE id=$1', [temporaryUserId]);
  const initialBalance = Number(balanceRows[0].saldo);
  const key = crypto.randomUUID();
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-CSRF-Token': csrf, 'Idempotency-Key': key },
    body: JSON.stringify({ monto: 100_000, plazoMeses: 6 }),
  };
  const firstLoanResponse = await request('/api/loans', requestOptions);
  const repeatedLoanResponse = await request('/api/loans', requestOptions);
  assert.equal(firstLoanResponse.status, 201);
  assert.equal(repeatedLoanResponse.status, 201);
  const firstLoan = (await firstLoanResponse.json()).loan;
  const repeatedLoan = (await repeatedLoanResponse.json()).loan;
  assert.equal(firstLoan.referencia, repeatedLoan.referencia);

  const { rows: resultRows } = await pool.query(
    `SELECT saldo,
            (SELECT COUNT(*)::int FROM prestamos WHERE usuario_id=$1 AND referencia=$2) AS prestamos,
            (SELECT COUNT(*)::int FROM transacciones WHERE usuario_id=$1 AND clave_idempotencia=$3) AS movimientos
     FROM usuarios WHERE id=$1`,
    [temporaryUserId, firstLoan.referencia, key],
  );
  assert.equal(Number(resultRows[0].saldo), initialBalance + 100000);
  assert.equal(resultRows[0].prestamos, 1);
  assert.equal(resultRows[0].movimientos, 1);

  const loansResponse = await request('/api/loans', { headers: { Cookie: cookies } });
  assert.equal(loansResponse.status, 200);
  assert.ok((await loansResponse.json()).loans.some((loan) => loan.referencia === firstLoan.referencia));
});

test('el superusuario desactiva, reactiva cuentas y puede ajustar su propio saldo', async () => {
  const targetCsrfResponse = await request('/api/auth/csrf');
  const targetCsrfCookie = cookiePairs(targetCsrfResponse).find((value) => value.startsWith('acme_csrf='));
  const targetCsrf = targetCsrfCookie.split('=', 2)[1];
  const targetLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: targetCsrfCookie, 'X-CSRF-Token': targetCsrf },
    body: JSON.stringify({ email: administrativeTargetEmail, contrasena: 'Temporal-prueba-2026!' }),
  });
  assert.equal(targetLogin.status, 200);
  const targetSessionCookie = cookiePairs(targetLogin).find((value) => value.startsWith('acme_session='));

  const adminCsrfResponse = await request('/api/auth/csrf');
  const adminCsrfCookie = cookiePairs(adminCsrfResponse).find((value) => value.startsWith('acme_csrf='));
  const adminCsrf = adminCsrfCookie.split('=', 2)[1];
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCsrfCookie, 'X-CSRF-Token': adminCsrf },
    body: JSON.stringify({ email: temporaryAdminEmail, contrasena: 'Temporal-prueba-2026!' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminSessionCookie = cookiePairs(adminLogin).find((value) => value.startsWith('acme_session='));
  const adminCookies = `${adminCsrfCookie}; ${adminSessionCookie}`;

  await Promise.all(Array.from({ length: 11 }, (_, index) => pool.query(
    `INSERT INTO auditoria_administrativa (administrador_id, usuario_afectado_id, accion, motivo, detalle, creada_en)
     VALUES ($1,$2,'AJUSTE_SALDO',$3,'{"origen":"prueba"}'::jsonb,NOW() - ($4 * INTERVAL '1 second'))`,
    [temporaryAdminId, administrativeTargetId, `Auditoría paginable ${index + 1}`, index],
  )));

  const firstAuditResponse = await request('/api/admin/audit?page=1&limit=100', { headers: { Cookie: adminCookies } });
  assert.equal(firstAuditResponse.status, 200);
  const firstAuditPage = await firstAuditResponse.json();
  assert.equal(firstAuditPage.audit.length, 10);
  assert.equal(firstAuditPage.pagination.pageSize, 10);
  assert.ok(firstAuditPage.pagination.total >= 11);
  assert.equal(firstAuditPage.pagination.hasNext, true);

  const secondAuditResponse = await request('/api/admin/audit?page=2', { headers: { Cookie: adminCookies } });
  const secondAuditPage = await secondAuditResponse.json();
  assert.equal(secondAuditPage.pagination.page, 2);
  assert.ok(secondAuditPage.audit.length >= 1 && secondAuditPage.audit.length <= 10);
  const invalidAuditPage = await request('/api/admin/audit?page=0', { headers: { Cookie: adminCookies } });
  assert.equal(invalidAuditPage.status, 400);

  const usersResponse = await request('/api/admin/users?limit=200', { headers: { Cookie: adminCookies } });
  assert.equal(usersResponse.status, 200);
  const usersPayload = await usersResponse.json();
  assert.ok(usersPayload.users.some((user) => user.id === Number(administrativeTargetId)));
  assert.ok(usersPayload.summary.total >= usersPayload.users.length);

  const deactivateResponse = await request(`/api/admin/users/${administrativeTargetId}/deactivate`, {
    method: 'POST',
    headers: { Cookie: adminCookies, 'X-CSRF-Token': adminCsrf },
  });
  assert.equal(deactivateResponse.status, 200);
  assert.equal((await deactivateResponse.json()).user.estado, 'desactivada');

  const targetSessionCheck = await request('/api/me', { headers: { Cookie: `${targetCsrfCookie}; ${targetSessionCookie}` } });
  assert.equal(targetSessionCheck.status, 401);

  const { rows } = await pool.query(
    `SELECT u.estado, u.desactivada_en, u.desactivada_por_id,
            (SELECT COUNT(*)::int FROM auditoria_administrativa WHERE usuario_afectado_id=u.id AND accion='DESACTIVAR_CUENTA') AS auditorias
     FROM usuarios u WHERE u.id=$1`,
    [administrativeTargetId],
  );
  assert.equal(rows[0].estado, 'desactivada');
  assert.ok(rows[0].desactivada_en);
  assert.equal(Number(rows[0].desactivada_por_id), Number(temporaryAdminId));
  assert.equal(rows[0].auditorias, 1);

  const repeatedDeactivation = await request(`/api/admin/users/${administrativeTargetId}/deactivate`, {
    method: 'POST',
    headers: { Cookie: adminCookies, 'X-CSRF-Token': adminCsrf },
  });
  assert.equal(repeatedDeactivation.status, 409);

  const reactivateResponse = await request(`/api/admin/users/${administrativeTargetId}/reactivate`, {
    method: 'POST',
    headers: { Cookie: adminCookies, 'X-CSRF-Token': adminCsrf },
  });
  assert.equal(reactivateResponse.status, 200);
  assert.equal((await reactivateResponse.json()).user.estado, 'activa');

  const reactivatedLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: targetCsrfCookie, 'X-CSRF-Token': targetCsrf },
    body: JSON.stringify({ email: administrativeTargetEmail, contrasena: 'Temporal-prueba-2026!' }),
  });
  assert.equal(reactivatedLogin.status, 200);

  const ownBalanceAdjustment = await request(`/api/admin/users/${temporaryAdminId}/adjust-balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookies, 'X-CSRF-Token': adminCsrf },
    body: JSON.stringify({ valor: 1000, motivo: 'Saldo de prueba para superusuario' }),
  });
  assert.equal(ownBalanceAdjustment.status, 201);

  const { rows: finalRows } = await pool.query(
    `SELECT u.estado, u.desactivada_en,
            (SELECT COUNT(*)::int FROM auditoria_administrativa WHERE usuario_afectado_id=u.id AND accion='REACTIVAR_CUENTA') AS reactivaciones
     FROM usuarios u WHERE u.id=$1`,
    [administrativeTargetId],
  );
  assert.equal(finalRows[0].estado, 'activa');
  assert.equal(finalRows[0].desactivada_en, null);
  assert.equal(finalRows[0].reactivaciones, 1);

  const { rows: adminRows } = await pool.query('SELECT saldo FROM usuarios WHERE id=$1', [temporaryAdminId]);
  assert.equal(Number(adminRows[0].saldo), 1000);
});

async function userDocument() {
  const { rows } = await pool.query('SELECT documento FROM usuarios WHERE id=$1', [temporaryUserId]);
  return rows[0].documento;
}
