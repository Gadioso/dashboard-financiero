import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitNonMovementCorrection, isVoiceRetranscriptionRequest } from '../lib/telegram-financial-safety.ts';

test('does not treat an explicit duplicate-card-payment correction as a new expense', () => {
  assert.equal(isExplicitNonMovementCorrection('No eran 23, eran 23,500 de un abono que había hecho, NO GASTO, no quiero que esté duplicado.'), true);
  assert.equal(isExplicitNonMovementCorrection('Estos movimientos ya están dados de alta; el de 23,500 era un abono.'), true);
  assert.equal(isExplicitNonMovementCorrection('Pagué 23,500 de mi tarjeta'), false);
});

test('recognizes a request to hear the previous note again', () => {
  assert.equal(isVoiceRetranscriptionRequest('No, muy mal. Escúchalo otra vez.'), true);
  assert.equal(isVoiceRetranscriptionRequest('Vuelve a escuchar el audio de nuevo'), true);
  assert.equal(isVoiceRetranscriptionRequest('Pagué 250 de gasolina'), false);
});
