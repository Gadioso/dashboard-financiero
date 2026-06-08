import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const year = Number(process.env.AUDIT_YEAR || 2026);

function readEnv() {
  const envPath = path.join(cwd, '.env.local');
  const env = { ...process.env };

  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
      if (value) env[key] = value;
    }
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }

  return env;
}

function monthKey(date) {
  const parsed = new Date(date);
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function groupDuplicates(rows, fields) {
  const grouped = new Map();

  for (const row of rows) {
    const key = fields.map((field) => {
      if (field === 'fecha_dia') return String(row.fecha || '').slice(0, 10);
      return String(row[field] ?? '').trim().toLowerCase();
    }).join('|');

    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  return [...grouped.values()].filter((items) => items.length > 1);
}

function looksLikeInformationalIncome(row) {
  const concept = String(row.concepto || '').toLowerCase();

  return /(?:tu cuenta|puedes consultar|estimado cliente|notificaci[oó]n santander|atentamente|santander m[eé]xico|informaci[oó]n|sin concepto)/i.test(concept);
}

function summarizeMonth({ ingresos, gastos, abonos, presupuestos }, monthIndex) {
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const ingresosMes = ingresos.filter((row) => monthKey(row.fecha) === key);
  const gastosMes = gastos.filter((row) => monthKey(row.fecha) === key);
  const abonosMes = abonos.filter((row) => monthKey(row.fecha) === key);
  const presupuesto = presupuestos.find((row) => String(row.mes_anio || '').startsWith(key));
  const totalIngresos = money(ingresosMes.reduce((sum, row) => sum + Number(row.monto || 0), 0));
  const totalGastos = money(gastosMes.reduce((sum, row) => sum + Number(row.monto || 0), 0));
  const totalSantanderTdc = money(
    gastosMes
      .filter((row) => row.origen === 'Santander_Email')
      .reduce((sum, row) => sum + Number(row.monto || 0), 0)
  );
  const totalAbonosTdc = money(abonosMes.reduce((sum, row) => sum + Number(row.monto || 0), 0));
  const expectedTercio = money(totalIngresos / 3);
  const presupuestoActual = presupuesto
    ? {
        Vida: money(presupuesto.techo_vida),
        Placeres: money(presupuesto.techo_placeres),
        Futuro: money(presupuesto.techo_futuro),
      }
    : null;

  return {
    mes: key,
    ingresos: totalIngresos,
    gastos: totalGastos,
    resultado: money(totalIngresos - totalGastos),
    gastosSantanderTdc: totalSantanderTdc,
    abonosTdc: totalAbonosTdc,
    deudaTdcEstimadaMes: money(Math.max(totalSantanderTdc - totalAbonosTdc, 0)),
    tercioEsperado: expectedTercio,
    presupuestoActual,
    presupuestoDesfasado: presupuestoActual
      ? Math.abs(presupuestoActual.Vida - expectedTercio) > 0.01 ||
        Math.abs(presupuestoActual.Placeres - expectedTercio) > 0.01 ||
        Math.abs(presupuestoActual.Futuro - expectedTercio) > 0.01
      : totalIngresos > 0,
  };
}

async function selectAll(supabase, table, columns) {
  const { data, error } = await supabase.from(table).select(columns);

  if (error) throw new Error(`No pude leer ${table}: ${error.message}`);

  return data || [];
}

async function main() {
  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  const [
    { data: ingresos, error: ingresosError },
    { data: gastos, error: gastosError },
    { data: abonos, error: abonosError },
    { data: presupuestos, error: presupuestosError },
  ] = await Promise.all([
    supabase.from('ingresos').select('id, concepto, monto, tipo, fecha').gte('fecha', start).lt('fecha', end),
    supabase.from('gastos').select('id, concepto, monto, categoria, subcategoria, origen, fecha').gte('fecha', start).lt('fecha', end),
    supabase.from('abonos_tarjeta_credito').select('id, concepto, monto, tarjeta, origen, fecha').gte('fecha', start).lt('fecha', end),
    supabase.from('presupuestos_mensuales').select('id, mes_anio, techo_vida, techo_placeres, techo_futuro, fase_ahorro'),
  ]);

  for (const error of [ingresosError, gastosError, abonosError, presupuestosError].filter(Boolean)) {
    throw new Error(error.message);
  }

  const suspectIncomes = (ingresos || []).filter(looksLikeInformationalIncome);
  const duplicateIncomes = groupDuplicates(ingresos || [], ['concepto', 'monto', 'fecha_dia']);
  const duplicateExpenses = groupDuplicates(gastos || [], ['concepto', 'monto', 'fecha_dia']);
  const duplicateCardPayments = groupDuplicates(abonos || [], ['concepto', 'monto', 'fecha_dia']);
  const monthly = Array.from({ length: 12 }, (_, monthIndex) =>
    summarizeMonth({ ingresos: ingresos || [], gastos: gastos || [], abonos: abonos || [], presupuestos: presupuestos || [] }, monthIndex)
  );
  const missingBudgetMonths = monthly.filter((month) => month.presupuestoDesfasado);
  const santanderHealth = await selectAll(
    supabase,
    'santander_ingest_logs',
    'id, created_at, status, reason, movimiento_tipo, concepto, monto, telegram_notified, error'
  ).catch((error) => ({ unavailable: true, error: error.message }));

  const report = {
    year,
    generatedAt: new Date().toISOString(),
    counts: {
      ingresos: ingresos?.length || 0,
      gastos: gastos?.length || 0,
      abonosTarjetaCredito: abonos?.length || 0,
      presupuestos: presupuestos?.length || 0,
      santanderLogs: Array.isArray(santanderHealth) ? santanderHealth.length : 0,
    },
    monthly,
    findings: {
      suspectIncomes,
      duplicateIncomes,
      duplicateExpenses,
      duplicateCardPayments,
      missingOrOutOfSyncBudgets: missingBudgetMonths,
      santanderLogs: Array.isArray(santanderHealth)
        ? {
            recentErrors: santanderHealth.filter((row) => row.status === 'error').slice(0, 10),
            recentUnnotified: santanderHealth.filter((row) => row.status === 'inserted' && !row.telegram_notified).slice(0, 10),
          }
        : santanderHealth,
    },
    recommendedActions: [
      suspectIncomes.length ? 'Revisar y borrar ingresos informativos con `npm run data:cleanup-suspects -- --apply`.' : null,
      missingBudgetMonths.length ? 'Recalcular presupuestos mensuales para meses desfasados.' : null,
      duplicateExpenses.length || duplicateIncomes.length || duplicateCardPayments.length ? 'Revisar duplicados antes de borrar.' : null,
      'Aplicar RLS en Supabase y rotar SUPABASE_SERVICE_ROLE_KEY antes de abrir acceso a terceros.',
    ].filter(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
