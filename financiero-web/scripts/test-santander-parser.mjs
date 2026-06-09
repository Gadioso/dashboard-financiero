import { parsearCorreoSantander } from '../lib/santander-email-parser.ts';

const cases = [
  {
    name: 'Starbucks pleasure',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Estimado Cliente:
Te informamos que se ha realizado una compra en el comercio STARBUCKS PATIO PATRIA con tu tarjeta de TDC terminación **1765, por un monto de $271.00 MXN.
El 01/06/2026 a las 19:18:06 hrs.`,
    expected: { concepto: 'STARBUCKS PATIO PATRIA', monto: 271, tipo: 'gasto', categoria: 'Placeres', subcategoria: 'Cafe' },
  },
  {
    name: 'OpenAI work tool',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio OPENAI *CHATGPT SUBSCR con tu tarjeta de TDC terminación **1765, por un monto de $399.00 MXN.
El 01/06/2026 a las 23:24:52 hrs.`,
    expected: { concepto: 'OPENAI *CHATGPT SUBSCR', monto: 399, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Herramientas Trabajo' },
  },
  {
    name: 'Telcel life expense',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio TELCEL con tu tarjeta de TDC terminación **1765, por un monto de $499.00 MXN.
El 02/06/2026 a las 10:00:00 hrs.`,
    expected: { concepto: 'TELCEL', monto: 499, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Costo de Vida' },
  },
  {
    name: 'Fiverr work tool',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio FIVERR INTERNATIONAL con tu tarjeta de TDC terminación **1765, por un monto de $850.00 MXN.
El 02/06/2026 a las 10:00:00 hrs.`,
    expected: { concepto: 'FIVERR INTERNATIONAL', monto: 850, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Herramientas Trabajo' },
  },
  {
    name: 'Opus work tool',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio OPUS CLIP con tu tarjeta de TDC terminación **1765, por un monto de $390.00 MXN.
El 02/06/2026 a las 10:00:00 hrs.`,
    expected: { concepto: 'OPUS CLIP', monto: 390, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Herramientas Trabajo' },
  },
  {
    name: 'Codex work tool',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio CODEX con tu tarjeta de TDC terminación **1765, por un monto de $299.00 MXN.
El 02/06/2026 a las 10:00:00 hrs.`,
    expected: { concepto: 'CODEX', monto: 299, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Herramientas Trabajo' },
  },
  {
    name: 'Oxxo Jacarandas pleasure expense',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Estimado Cliente:
Te informamos que se ha realizado una compra en el comercio OXXO JACARANDAS con tu tarjeta de TDC terminación **1765, por un monto de $338.00 MXN.
El 04/06/2026 a las 21:07:57 hrs.
Atentamente
Santander México`,
    expected: { concepto: 'OXXO JACARANDAS', monto: 338, tipo: 'gasto', categoria: 'Placeres', subcategoria: 'Otros Placeres' },
  },
  {
    name: 'Oxxo service life expense',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio OXXO RECARGA TELCEL con tu tarjeta de TDC terminación **1765, por un monto de $200.00 MXN.
El 04/06/2026 a las 21:07:57 hrs.`,
    expected: { concepto: 'OXXO RECARGA TELCEL', monto: 200, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Costo de Vida' },
  },
  {
    name: '7 Eleven convenience pleasure expense',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio 7 ELEVEN T2718 JAVIER con tu tarjeta de TDC terminación **1765, por un monto de $248.00 MXN.
El 06/06/2026 a las 22:15:35 hrs.`,
    expected: { concepto: '7 ELEVEN T2718 JAVIER', monto: 248, tipo: 'gasto', categoria: 'Placeres', subcategoria: 'Otros Placeres' },
  },
  {
    name: 'Mercado Pago ambiguous expense is pleasure',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio MERCADOPAGO *MARIADEL con tu tarjeta de TDC terminación **1765, por un monto de $161.00 MXN.
El 06/06/2026 a las 20:40:00 hrs.`,
    expected: { concepto: 'MERCADOPAGO *MARIADEL', monto: 161, tipo: 'gasto', categoria: 'Placeres', subcategoria: 'Otros Placeres' },
  },
  {
    name: 'Unknown Santander expense defaults to pleasure',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio COMERCIO RANDOM con tu tarjeta de TDC terminación **1765, por un monto de $120.00 MXN.
El 06/06/2026 a las 20:40:00 hrs.`,
    expected: { concepto: 'RANDOM', monto: 120, tipo: 'gasto', categoria: 'Placeres', subcategoria: 'Otros Placeres' },
  },
  {
    name: 'Gasoline is life expense',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio GASOLINA SHELL con tu tarjeta de TDC terminación **1765, por un monto de $800.00 MXN.
El 06/06/2026 a las 20:40:00 hrs.`,
    expected: { concepto: 'GASOLINA SHELL', monto: 800, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Costo de Vida' },
  },
  {
    name: 'Super groceries are life expense',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio SUPERAMA DESPENSA con tu tarjeta de TDC terminación **1765, por un monto de $1500.00 MXN.
El 06/06/2026 a las 20:40:00 hrs.`,
    expected: { concepto: 'SUPERAMA DESPENSA', monto: 1500, tipo: 'gasto', categoria: 'Vida', subcategoria: 'Costo de Vida' },
  },
  {
    name: 'Uber is pleasure by default',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio UBER TRIP HELP.UBER.COM con tu tarjeta de TDC terminación **1765, por un monto de $146.00 MXN.
El 06/06/2026 a las 20:40:00 hrs.`,
    expected: { concepto: 'UBER TRIP HELP.UBER.COM', monto: 146, tipo: 'gasto', categoria: 'Placeres', subcategoria: 'Viajes' },
  },
  {
    name: 'Insurance is future',
    raw: `Santander México
Pago/Compra con Tarjeta Santander
Te informamos que se ha realizado una compra en el comercio SEGMONTERREYNYL6 MU con tu tarjeta de TDC terminación **1765, por un monto de $15581.01 MXN.
El 26/05/2026 a las 17:31:02 hrs.`,
    expected: { concepto: 'SEGMONTERREYNYL6 MU', monto: 15581.01, tipo: 'gasto', categoria: 'Futuro', subcategoria: 'Seguros' },
  },
  {
    name: 'Credit card payment',
    raw: `Santander México
Pago de Tarjeta de Crédito Santander
Te informamos que se realizó un pago a tu tarjeta de crédito TDC terminación **1765, por un monto de $5,000.00 MXN.
El 07/06/2026 a las 10:00:00 hrs.`,
    expected: { concepto: 'Pago tarjeta de crédito Santander', monto: 5000, tipo: 'abono_tarjeta', categoria: 'Futuro', subcategoria: 'Pago Tarjeta Credito' },
  },
  {
    name: 'Non movement',
    raw: `Santander México
SUPERTOKEN ACTIVADO
Estimado cliente, se ha realizado con éxito la activación del SuperToken en tu Banca Digital.`,
    expected: null,
  },
  {
    name: 'Informational footer is not income',
    raw: `Santander México
Transferencia recibida
Abono por $2,300,000.00 MXN.
Puedes consultar tus movimientos de forma gratuita las veces que quieras:
• Desde tu celular con SuperMóvil
• Desde tu cuenta`,
    expected: null,
  },
];

const results = cases.map((testCase) => {
  const actual = parsearCorreoSantander(testCase.raw);
  const pass =
    testCase.expected === null
      ? actual === null
      : actual &&
        actual.concepto === testCase.expected.concepto &&
        actual.monto === testCase.expected.monto &&
        actual.tipo === testCase.expected.tipo &&
        actual.categoria === testCase.expected.categoria &&
        actual.subcategoria === testCase.expected.subcategoria;

  return { name: testCase.name, pass: Boolean(pass), actual };
});
const failed = results.filter((result) => !result.pass);

console.log(JSON.stringify({ results, failedCount: failed.length }, null, 2));

if (failed.length) {
  process.exit(1);
}
