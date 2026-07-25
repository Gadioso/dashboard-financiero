import assert from 'node:assert/strict';
import { resolverFechaMovimiento } from '../lib/financial-core.ts';

const ahora = new Date('2026-07-20T18:00:00.000Z');

assert.equal(
  resolverFechaMovimiento(
    'Gasté 1300 en batería racer el 18 de julio',
    '2024-07-18T00:00:00.000Z',
    ahora,
  ).toISOString(),
  '2026-07-18T12:00:00.000Z',
  'Una fecha sin año debe usar el año actual de México y prevalecer sobre la IA.',
);

assert.equal(
  resolverFechaMovimiento(
    'Gasté 1300 en batería racer el 18 de julio de 2024',
    '2026-07-18T00:00:00.000Z',
    ahora,
  ).toISOString(),
  '2024-07-18T12:00:00.000Z',
  'Un año explícito del usuario debe conservarse.',
);

assert.equal(
  resolverFechaMovimiento(
    'Registré este movimiento el viernes pasado',
    '2024-07-17T12:00:00.000Z',
    ahora,
  ).toISOString(),
  '2026-07-17T12:00:00.000Z',
  'Una fecha sugerida sin año explícito no puede quedar en un año ajeno al actual.',
);

assert.equal(
  resolverFechaMovimiento(
    'Gasté 1250 en la fiesta ayer',
    '2024-06-21T00:00:00.000Z',
    ahora,
  ).toISOString(),
  '2026-07-19T12:00:00.000Z',
  'Una fecha relativa del texto debe prevalecer sobre la fecha sugerida por la IA.',
);

assert.equal(
  resolverFechaMovimiento('Gasté 200 en comida', undefined, ahora).toISOString(),
  ahora.toISOString(),
  'Sin fecha escrita ni sugerida debe usarse el momento actual.',
);

console.log(JSON.stringify({ success: true, checked: 5 }, null, 2));
