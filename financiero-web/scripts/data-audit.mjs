import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const year = Number(process.env.AUDIT_YEAR || 2026);

function readEnv() {
  const envPaths = [path.join(cwd, '..', '.env'), path.join(cwd, '.env.local')];
  const env = { ...process.env };

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;

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

  if (!env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_URL) {
    env.NEXT_PUBLIC_SUPABASE_URL = env.SUPABASE_URL;
  }

  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    env.NEXT_PUBLIC_SUPABASE_URL = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin;
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

function looksLikeSuspiciousCardPayment(row) {
  const concept = String(row.concepto || '').toLowerCase();
  const amount = Number(row.monto || 0);

  return amount >= 100000 ||
    /(?:l[ií]nea de cr[eé]dito|cr[eé]dito preaprobado|aprovecha|promoci[oó]n|oferta|beneficio|sin concepto|movimiento santander)/i.test(concept);
}

function summarizeMonth({ ingresos, gastos, abonos, presupuestos }, monthIndex) {
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const ingresosMes = ingresos.filter((row) => monthKey(row.fecha) === key);
  const gastosMes = gastos.filter((row) => monthKey(row.fecha) === key);
  const abonosMes = abonos.filter((row) => monthKey(row.fecha) === key);
  const presupuestosMes = presupuestos.filter((row) => String(row.mes_anio || '').startsWith(key));
  const profileKeys = [...new Set([...ingresosMes, ...gastosMes, ...abonosMes, ...presupuestosMes].map((row) => row.profile_id || ''))];
  const budgetIssues = profileKeys.flatMap((profileId) => {
    const ingresosPerfil = ingresosMes.filter((row) => (row.profile_id || '') === profileId);
    const totalPerfil = money(ingresosPerfil.reduce((sum, row) => sum + Number(row.monto || 0), 0));
    const expectedProfileBudget = { Vida: money(totalPerfil * 0.50), Placeres: money(totalPerfil * 0.25), Futuro: money(totalPerfil * 0.25) };
    const presupuestoPerfil = presupuestosMes.find((row) => (row.profile_id || '') === profileId);

    if (!presupuestoPerfil) {
      return [{
        profile: `perfil-${profileKeys.indexOf(profileId) + 1}`,
        issue: 'missing_budget',
        totalIngresos: totalPerfil,
        expected: expectedProfileBudget,
        current: null,
      }];
    }

    const current = {
      Vida: money(presupuestoPerfil.techo_vida),
      Placeres: money(presupuestoPerfil.techo_placeres),
      Futuro: money(presupuestoPerfil.techo_futuro),
    };
    const outOfSync = Math.abs(current.Vida - expectedProfileBudget.Vida) > 0.01 ||
      Math.abs(current.Placeres - expectedProfileBudget.Placeres) > 0.01 ||
      Math.abs(current.Futuro - expectedProfileBudget.Futuro) > 0.01;

    return outOfSync
      ? [{
          profile: `perfil-${profileKeys.indexOf(profileId) + 1}`,
          issue: 'out_of_sync_budget',
          totalIngresos: totalPerfil,
          expected: expectedProfileBudget,
          current,
        }]
      : [];
  });

  const profiles = profileKeys.map((profileId, index) => {
    const ingresosPerfil = ingresosMes.filter((row) => (row.profile_id || '') === profileId);
    const gastosPerfil = gastosMes.filter((row) => (row.profile_id || '') === profileId);
    const abonosPerfil = abonosMes.filter((row) => (row.profile_id || '') === profileId);
    const presupuesto = presupuestosMes.find((row) => (row.profile_id || '') === profileId);
    const ingresosTotal = money(ingresosPerfil.reduce((sum, row) => sum + Number(row.monto || 0), 0));
    const gastosTotal = money(gastosPerfil.reduce((sum, row) => sum + Number(row.monto || 0), 0));
    return {
      profile: `perfil-${index + 1}`,
      ingresos: ingresosTotal,
      gastos: gastosTotal,
      resultado: money(ingresosTotal - gastosTotal),
      abonosTdc: money(abonosPerfil.reduce((sum, row) => sum + Number(row.monto || 0), 0)),
      presupuestoEsperado: { Vida: money(ingresosTotal * 0.50), Placeres: money(ingresosTotal * 0.25), Futuro: money(ingresosTotal * 0.25) },
      presupuestoActual: presupuesto ? { Vida: money(presupuesto.techo_vida), Placeres: money(presupuesto.techo_placeres), Futuro: money(presupuesto.techo_futuro) } : null,
    };
  });
  return { mes: key, profiles, budgetIssues, presupuestoDesfasado: budgetIssues.length > 0 };
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
    supabase.from('ingresos').select('id, concepto, monto, tipo, fecha, profile_id').gte('fecha', start).lt('fecha', end),
    supabase.from('gastos').select('id, concepto, monto, categoria, subcategoria, origen, fecha, profile_id').gte('fecha', start).lt('fecha', end),
    supabase.from('abonos_tarjeta_credito').select('id, concepto, monto, tarjeta, origen, fecha, profile_id').gte('fecha', start).lt('fecha', end),
    supabase.from('presupuestos_mensuales').select('id, mes_anio, profile_id, techo_vida, techo_placeres, techo_futuro, fase_ahorro'),
  ]);

  for (const error of [ingresosError, gastosError, abonosError, presupuestosError].filter(Boolean)) {
    throw new Error(error.message);
  }

  const suspectIncomes = (ingresos || []).filter(looksLikeInformationalIncome);
  const suspectCardPayments = (abonos || []).filter(looksLikeSuspiciousCardPayment);
  // Duplicate detection is only meaningful inside one tenant. Never use this
  // audit output as a deletion signal across profiles.
  const duplicateIncomes = groupDuplicates(ingresos || [], ['profile_id', 'concepto', 'monto', 'fecha_dia']);
  const duplicateExpenses = groupDuplicates(gastos || [], ['profile_id', 'concepto', 'monto', 'fecha_dia']);
  const duplicateCardPayments = groupDuplicates(abonos || [], ['profile_id', 'concepto', 'monto', 'fecha_dia']);
  const monthly = Array.from({ length: 12 }, (_, monthIndex) =>
    summarizeMonth({ ingresos: ingresos || [], gastos: gastos || [], abonos: abonos || [], presupuestos: presupuestos || [] }, monthIndex)
  );
  const missingBudgetMonths = monthly.filter((month) => month.presupuestoDesfasado);
  // Santander email ingestion was intentionally retired in migration
  // 20260722201720_remove_fiscal_and_email_ingest.sql, which drops this
  // table. Treating its absence as an access failure made audit reports imply
  // that a live data source lacked freshness evidence.
  const santanderIngestion = {
    status: 'retired',
    reason: 'Santander email ingestion and its logs were deliberately removed from the product.',
    freshness: 'not_applicable',
  };

  const report = {
    year,
    generatedAt: new Date().toISOString(),
    counts: {
      ingresos: ingresos?.length || 0,
      gastos: gastos?.length || 0,
      abonosTarjetaCredito: abonos?.length || 0,
      presupuestos: presupuestos?.length || 0,
      santanderIngestion: santanderIngestion.status,
    },
    monthly,
    findings: {
      suspectIncomes,
      suspectCardPayments,
      duplicateIncomes,
      duplicateExpenses,
      duplicateCardPayments,
      missingOrOutOfSyncBudgets: missingBudgetMonths,
      santanderIngestion,
    },
    recommendedActions: [
      suspectIncomes.length ? 'Revisar y borrar ingresos informativos con `npm run data:cleanup-suspects -- --apply`.' : null,
      suspectCardPayments.length ? 'Revisar y borrar abonos TDC sospechosos con `npm run data:cleanup-suspects -- --apply --card-payments`.' : null,
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
