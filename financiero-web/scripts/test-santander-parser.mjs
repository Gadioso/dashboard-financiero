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
    name: 'Non movement',
    raw: `Santander México
SUPERTOKEN ACTIVADO
Estimado cliente, se ha realizado con éxito la activación del SuperToken en tu Banca Digital.`,
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
