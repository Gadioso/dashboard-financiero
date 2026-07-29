import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinancialImportRow,
  parseFinancialAmount,
  parseFinancialDate,
  parseTabularFinancialImport,
} from '../lib/financial-import.ts';

test('normaliza montos mexicanos y cargos entre paréntesis', () => {
  assert.equal(parseFinancialAmount('$1,234.56'), 1234.56);
  assert.equal(parseFinancialAmount('1.234,56'), 1234.56);
  assert.equal(parseFinancialAmount('($850.00)'), -850);
});

test('normaliza fechas dd/mm/yyyy sin invertir día y mes', () => {
  assert.equal(parseFinancialDate('31/01/2026')?.slice(0, 10), '2026-01-31');
  assert.equal(parseFinancialDate('2026-07-15')?.slice(0, 10), '2026-07-15');
  assert.equal(parseFinancialDate('31/02/2026'), null);
});

test('detecta encabezados bancarios Cargo y Abono y homologa movimientos', async () => {
  const file = new File([
    'Estado de cuenta enero\nFecha operación,Descripción,Cargo,Abono,Moneda\n15/01/2026,Supermercado,"$1,250.00",,MXN\n16/01/2026,Nómina,,25000,MXN',
  ], 'estado.csv', { type: 'text/csv' });
  const parsed = await parseTabularFinancialImport(file);

  assert.equal(parsed.sourceType, 'csv');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].movementType, 'gasto');
  assert.equal(parsed.rows[0].category, 'Vida');
  assert.equal(parsed.rows[1].movementType, 'ingreso');
});

test('marca datos incompletos antes de una confirmación', () => {
  const row = buildFinancialImportRow({
    rowIndex: 8,
    movementType: 'gasto',
    occurredAt: '',
    description: '',
    amount: 0,
  });
  assert.equal(row.status, 'invalid');
  assert.equal(row.validationErrors.length, 3);
});
