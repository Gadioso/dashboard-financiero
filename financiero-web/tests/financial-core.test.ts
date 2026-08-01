import test from 'node:test';
import assert from 'node:assert/strict';
import { mesKeyDesdeFecha } from '../lib/financial-core.ts';

test('uses Mexico City month instead of UTC month at month boundaries', () => {
  assert.equal(mesKeyDesdeFecha(new Date('2026-08-01T00:05:00.000Z')), '2026-07');
  assert.equal(mesKeyDesdeFecha(new Date('2026-08-01T06:05:00.000Z')), '2026-08');
});
