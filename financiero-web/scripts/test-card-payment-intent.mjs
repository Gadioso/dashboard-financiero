import assert from 'node:assert/strict';
import { esAbonoTarjetaCredito, extraerMontoAbonoTarjeta } from '../lib/card-payment-intent.ts';

const cases = [
  ['agrega abono de 10k', true, 10000],
  ['registra abono 10000', true, 10000],
  ['hice un abono de 10k a tarjeta', true, 10000],
  ['tomar un abono de diez mil pesos la tarjeta', true, 10000],
  ['pague $10,000 a la de credito', true, 10000],
  ['aplicar 10 mil a tarjeta de crédito', true, 10000],
  ['agrega ingreso de 10k por abono recibido', false, 10000],
  ['metí 250 de gasolina', false, 250],
  ['compre tacos por 180', false, 180],
];

for (const [text, expectedIntent, expectedAmount] of cases) {
  assert.equal(esAbonoTarjetaCredito(text), expectedIntent, `intent: ${text}`);
  assert.equal(extraerMontoAbonoTarjeta(text), expectedAmount, `amount: ${text}`);
}

console.log(JSON.stringify({ success: true, checked: cases.length }, null, 2));
