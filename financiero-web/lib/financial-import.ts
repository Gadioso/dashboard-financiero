import { createHash } from 'node:crypto';
import readXlsxFile, { type CellValue } from 'read-excel-file/node';

export const MAX_FINANCIAL_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_FINANCIAL_IMPORT_ROWS = 5_000;

export type FinancialImportSource = 'xlsx' | 'csv' | 'pdf';
export type FinancialImportMovementType = 'gasto' | 'ingreso';
export type FinancialImportCategory = 'Vida' | 'Placeres' | 'Futuro';

export type FinancialImportRow = {
  rowIndex: number;
  movementType: FinancialImportMovementType;
  occurredAt: string | null;
  description: string;
  amount: number | null;
  category: FinancialImportCategory;
  subcategory: string;
  currency: string;
  status: 'ready' | 'invalid' | 'duplicate';
  validationErrors: string[];
  fingerprint: string;
  sourceData: Record<string, unknown>;
};

export type FinancialImportParseResult = {
  sourceType: FinancialImportSource;
  detectedMapping: Record<string, unknown>;
  rows: FinancialImportRow[];
};

type ColumnKey = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'category' | 'subcategory' | 'currency';
type RawCell = CellValue | null;

const columnAliases: Record<ColumnKey, string[]> = {
  date: ['fecha', 'fecha operacion', 'fecha movimiento', 'fecha transaccion', 'date', 'transaction date', 'posting date'],
  description: ['concepto', 'descripcion', 'detalle', 'comercio', 'referencia', 'movimiento', 'description', 'transaction description', 'merchant'],
  amount: ['monto', 'importe', 'cantidad', 'valor', 'amount', 'transaction amount'],
  debit: ['cargo', 'cargos', 'debito', 'debitos', 'retiro', 'retiros', 'egreso', 'egresos', 'salida', 'debit'],
  credit: ['abono', 'abonos', 'credito', 'creditos', 'deposito', 'depositos', 'ingreso', 'ingresos', 'entrada', 'credit'],
  type: ['tipo', 'tipo movimiento', 'naturaleza', 'movimiento tipo', 'transaction type'],
  category: ['categoria', 'rubro', 'clasificacion', 'category'],
  subcategory: ['subcategoria', 'sub categoria', 'subrubro', 'subcategory'],
  currency: ['moneda', 'divisa', 'currency'],
};

function normalizeLabel(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDescription(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function parseFinancialAmount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed) || /^-/.test(trimmed) || /-$/.test(trimmed);
  let numeric = trimmed.replace(/[^0-9,.-]/g, '').replace(/^-|-$|\(|\)/g, '');
  const lastComma = numeric.lastIndexOf(',');
  const lastDot = numeric.lastIndexOf('.');

  if (lastComma > lastDot && /^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(numeric)) {
    numeric = numeric.replace(/\./g, '').replace(',', '.');
  } else {
    numeric = numeric.replace(/,/g, '');
  }

  const amount = Number(numeric);
  return Number.isFinite(amount) ? (negative ? -Math.abs(amount) : amount) : null;
}

export function parseFinancialDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && value > 20_000 && value < 80_000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86_400_000).toISOString();
  }

  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+.*)?$/);
  const local = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s+.*)?$/);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (local) {
    day = Number(local[1]);
    month = Number(local[2]);
    year = Number(local[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
  } else {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? parsed.toISOString()
    : null;
}

function inferMovementType(typeValue: unknown, amount: number, debit: number | null, credit: number | null) {
  if (credit !== null && Math.abs(credit) > 0) return 'ingreso' as const;
  if (debit !== null && Math.abs(debit) > 0) return 'gasto' as const;
  const type = normalizeLabel(typeValue);
  if (/ingreso|abono|credito|deposito|entrada|income|credit/.test(type)) return 'ingreso' as const;
  if (/gasto|cargo|debito|retiro|egreso|salida|expense|debit/.test(type)) return 'gasto' as const;
  return amount < 0 ? 'gasto' as const : 'ingreso' as const;
}

export function categorizeImportedMovement(description: string, explicitCategory?: unknown) {
  const explicit = normalizeLabel(explicitCategory);
  if (explicit === 'vida') return { category: 'Vida' as const, subcategory: 'Vida' };
  if (explicit === 'futuro' || explicit === 'seguros') return { category: 'Futuro' as const, subcategory: explicit === 'seguros' ? 'Seguros' : 'Futuro' };
  if (explicit === 'placeres' || explicit === 'placer') return { category: 'Placeres' as const, subcategory: 'Placeres' };

  const value = normalizeLabel(description);
  if (/nomina|sueldo|salario|deposito|transferencia recibida|honorarios|venta|pago recibido/.test(value)) {
    return { category: 'Futuro' as const, subcategory: 'Ingreso' };
  }
  if (/renta|hipoteca|luz|agua|gas|internet|telefono|supermercado|despensa|farmacia|medico|colegiatura|gasolina|transporte/.test(value)) {
    return { category: 'Vida' as const, subcategory: /gasolina|transporte/.test(value) ? 'Transporte' : 'Gastos esenciales' };
  }
  if (/seguro|inversion|cetes|gbm|ahorro|fondo|retiro|aportacion/.test(value)) {
    return { category: 'Futuro' as const, subcategory: /seguro/.test(value) ? 'Seguros' : 'Ahorro e inversión' };
  }
  if (/restaurante|cafe|cine|bar|viaje|hotel|airbnb|rappi|uber eats|spotify|netflix|amazon|mercado libre/.test(value)) {
    return { category: 'Placeres' as const, subcategory: /viaje|hotel|airbnb/.test(value) ? 'Viajes' : 'Consumo discrecional' };
  }
  return { category: 'Placeres' as const, subcategory: 'Otros Placeres' };
}

function createFingerprint({ occurredAt, description, amount, movementType }: Pick<FinancialImportRow, 'occurredAt' | 'description' | 'amount' | 'movementType'>) {
  const date = occurredAt ? occurredAt.slice(0, 10) : '';
  const normalizedDescription = normalizeLabel(description).slice(0, 120);
  const normalizedAmount = amount === null ? '' : Math.abs(amount).toFixed(2);
  return createHash('sha256').update(`${date}|${movementType}|${normalizedAmount}|${normalizedDescription}`).digest('hex');
}

function detectHeader(data: RawCell[][]) {
  let best: { index: number; mapping: Partial<Record<ColumnKey, number>>; score: number } | null = null;
  const candidates = data.slice(0, 15);
  for (let index = 0; index < candidates.length; index += 1) {
    const row = candidates[index];
    const mapping: Partial<Record<ColumnKey, number>> = {};
    row.forEach((cell, columnIndex) => {
      const label = normalizeLabel(cell);
      (Object.keys(columnAliases) as ColumnKey[]).forEach((key) => {
        if (mapping[key] === undefined && columnAliases[key].includes(label)) mapping[key] = columnIndex;
      });
    });
    const score = Object.keys(mapping).length + (mapping.date !== undefined ? 2 : 0) + (mapping.description !== undefined ? 2 : 0)
      + (mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined ? 2 : 0);
    if (!best || score > best.score) best = { index, mapping, score };
  }
  if (!best || best.score < 7 || best.mapping.date === undefined || best.mapping.description === undefined
    || (best.mapping.amount === undefined && best.mapping.debit === undefined && best.mapping.credit === undefined)) {
    throw new Error('No pude reconocer las columnas. Incluye Fecha, Concepto y Monto, o bien Cargo y Abono.');
  }
  return best;
}

function rowValue(row: RawCell[], index: number | undefined) {
  return index === undefined ? null : row[index] ?? null;
}

function normalizeTabularRows(data: RawCell[][], sheetName: string, startingIndex: number) {
  const header = detectHeader(data);
  const output: FinancialImportRow[] = [];
  const seen = new Set<string>();

  data.slice(header.index + 1).forEach((row, relativeIndex) => {
    if (row.every((cell) => cell === null || String(cell).trim() === '')) return;
    const debit = parseFinancialAmount(rowValue(row, header.mapping.debit));
    const credit = parseFinancialAmount(rowValue(row, header.mapping.credit));
    const rawAmount = header.mapping.amount !== undefined
      ? parseFinancialAmount(rowValue(row, header.mapping.amount))
      : credit !== null && Math.abs(credit) > 0 ? credit : debit;
    const signedAmount = rawAmount ?? 0;
    const movementType = inferMovementType(rowValue(row, header.mapping.type), signedAmount, debit, credit);
    const amount = rawAmount === null ? null : Math.abs(rawAmount);
    const description = cleanDescription(rowValue(row, header.mapping.description));
    const occurredAt = parseFinancialDate(rowValue(row, header.mapping.date));
    const inferred = categorizeImportedMovement(description, rowValue(row, header.mapping.category));
    const subcategory = cleanDescription(rowValue(row, header.mapping.subcategory)) || inferred.subcategory;
    const currency = cleanDescription(rowValue(row, header.mapping.currency)).toUpperCase().slice(0, 3) || 'MXN';
    const validationErrors: string[] = [];
    if (!occurredAt) validationErrors.push('Fecha inválida o vacía.');
    if (!description) validationErrors.push('Concepto vacío.');
    if (amount === null || amount <= 0) validationErrors.push('Monto inválido o igual a cero.');
    const fingerprint = createFingerprint({ occurredAt, description, amount, movementType });
    const duplicateInFile = seen.has(fingerprint);
    if (!validationErrors.length) seen.add(fingerprint);

    output.push({
      rowIndex: startingIndex + output.length,
      movementType,
      occurredAt,
      description,
      amount,
      category: inferred.category,
      subcategory,
      currency,
      status: validationErrors.length ? 'invalid' : duplicateInFile ? 'duplicate' : 'ready',
      validationErrors: duplicateInFile ? ['Movimiento repetido dentro del archivo.'] : validationErrors,
      fingerprint,
      sourceData: {
        sheet: sheetName,
        sourceRow: header.index + relativeIndex + 2,
        values: Object.fromEntries(Object.entries(header.mapping).map(([key, index]) => [key, rowValue(row, index)])),
      },
    });
  });

  return { rows: output, header };
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 8).join('\n');
  const counts = [',', ';', '\t'].map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter || ',';
}

function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function sourceTypeForFile(file: Pick<File, 'name' | 'type'>): FinancialImportSource | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (extension === 'csv' || file.type === 'text/csv' || file.type === 'application/csv') return 'csv';
  if (extension === 'xlsx' || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return null;
}

export async function parseTabularFinancialImport(file: File): Promise<FinancialImportParseResult> {
  const sourceType = sourceTypeForFile(file);
  if (sourceType !== 'csv' && sourceType !== 'xlsx') throw new Error('El archivo no es una hoja de cálculo compatible.');
  const sheets = sourceType === 'csv'
    ? [{ sheet: 'CSV', data: parseCsv(Buffer.from(await file.arrayBuffer()).toString('utf8')) as RawCell[][] }]
    : await readXlsxFile(Buffer.from(await file.arrayBuffer()));
  const rows: FinancialImportRow[] = [];
  const mappings: Record<string, unknown>[] = [];

  for (const sheet of sheets) {
    if (!sheet.data.some((row) => row.some((cell) => cell !== null && String(cell).trim()))) continue;
    const normalized = normalizeTabularRows(sheet.data, sheet.sheet, rows.length + 1);
    rows.push(...normalized.rows);
    mappings.push({
      sheet: sheet.sheet,
      headerRow: normalized.header.index + 1,
      columns: Object.fromEntries(Object.entries(normalized.header.mapping).map(([key, index]) => [key, Number(index) + 1])),
    });
    if (rows.length > MAX_FINANCIAL_IMPORT_ROWS) throw new Error(`El archivo supera el límite de ${MAX_FINANCIAL_IMPORT_ROWS.toLocaleString('es-MX')} movimientos.`);
  }

  if (!rows.length) throw new Error('No encontré movimientos debajo de los encabezados del archivo.');
  return { sourceType, detectedMapping: { sheets: mappings }, rows };
}

export function buildFinancialImportRow(input: {
  rowIndex: number;
  movementType: FinancialImportMovementType;
  occurredAt: unknown;
  description: unknown;
  amount: unknown;
  category?: unknown;
  subcategory?: unknown;
  currency?: unknown;
  sourceData?: Record<string, unknown>;
}) {
  const description = cleanDescription(input.description);
  const occurredAt = parseFinancialDate(input.occurredAt);
  const parsedAmount = parseFinancialAmount(input.amount);
  const amount = parsedAmount === null ? null : Math.abs(parsedAmount);
  const inferred = categorizeImportedMovement(description, input.category);
  const validationErrors: string[] = [];
  if (!occurredAt) validationErrors.push('Fecha inválida o vacía.');
  if (!description) validationErrors.push('Concepto vacío.');
  if (amount === null || amount <= 0) validationErrors.push('Monto inválido o igual a cero.');
  const row: FinancialImportRow = {
    rowIndex: input.rowIndex,
    movementType: input.movementType,
    occurredAt,
    description,
    amount,
    category: inferred.category,
    subcategory: cleanDescription(input.subcategory) || inferred.subcategory,
    currency: cleanDescription(input.currency).toUpperCase().slice(0, 3) || 'MXN',
    status: validationErrors.length ? 'invalid' : 'ready',
    validationErrors,
    fingerprint: '',
    sourceData: input.sourceData || {},
  };
  row.fingerprint = createFingerprint(row);
  return row;
}
