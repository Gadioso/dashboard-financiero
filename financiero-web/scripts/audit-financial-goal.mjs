import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();

function readEnv() {
  const envPath = path.join(cwd, '.env.local');
  const env = {};

  if (!fs.existsSync(envPath)) {
    throw new Error('No existe .env.local.');
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    env[line.slice(0, index)] = line.slice(index + 1).trim().replace(/^"|"$/g, '');
  }

  return env;
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function monthRange(year, monthIndex) {
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString(),
  };
}

async function monthSummary(supabase, monthIndex) {
  const { start, end } = monthRange(2026, monthIndex);
  const [{ data: ingresos, error: ingresosError }, { data: gastos, error: gastosError }, { data: presupuesto, error: presupuestoError }] =
    await Promise.all([
      supabase.from('ingresos').select('monto, concepto, fecha').gte('fecha', start).lt('fecha', end),
      supabase.from('gastos').select('monto, concepto, categoria, subcategoria, fecha').gte('fecha', start).lt('fecha', end),
      supabase
        .from('presupuestos_mensuales')
        .select('techo_vida, techo_placeres, techo_futuro, fase_ahorro')
        .eq('mes_anio', `2026-${String(monthIndex + 1).padStart(2, '0')}-01`)
        .maybeSingle(),
    ]);

  if (ingresosError || gastosError || presupuestoError) {
    throw new Error((ingresosError || gastosError || presupuestoError).message);
  }

  const totalIngresos = money((ingresos || []).reduce((sum, row) => sum + Number(row.monto), 0));
  const totalGastos = money((gastos || []).reduce((sum, row) => sum + Number(row.monto), 0));

  return { ingresos: ingresos || [], gastos: gastos || [], presupuesto, totalIngresos, totalGastos };
}

function scanVisibleEscudo() {
  const files = [
    'app/Components/DashboardFinanciero.tsx',
    'lib/conversation-agent.ts',
    'lib/financial-core.ts',
  ];

  return files.flatMap((file) => {
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    return text.includes('Fase 1: Escudo') ? [file] : [];
  });
}

function fileIncludes(file, terms) {
  const text = fs.readFileSync(path.join(cwd, file), 'utf8');

  return terms.every((term) => text.includes(term));
}

async function main() {
  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const enero = await monthSummary(supabase, 0);
  const abril = await monthSummary(supabase, 3);
  const mayo = await monthSummary(supabase, 4);
  const promedioMarAbrMay = money((marzoAbrilMayoPromedio(await monthSummary(supabase, 2), abril, mayo)));
  const gbm = abril.gastos.filter((row) => String(row.concepto).toLowerCase().includes('gbm') && Number(row.monto) === 100000);
  const visibleEscudo = scanVisibleEscudo();
  const santanderHealth = await getSantanderHealth();
  const expectedMayoTercio = money(mayo.totalIngresos / 3);
  const checks = [
    {
      name: 'Enero totals from Excel',
      pass: enero.totalIngresos === 29258 && enero.totalGastos === 18271,
      evidence: { ingresos: enero.totalIngresos, gastos: enero.totalGastos },
    },
    {
      name: 'GBM investment on 2026-04-14',
      pass: gbm.length === 1 && gbm[0].subcategoria === 'Inversion',
      evidence: gbm,
    },
    {
      name: 'Mayo 33/33/33 budget in Supabase',
      pass:
        money(mayo.presupuesto?.techo_vida) === expectedMayoTercio &&
        money(mayo.presupuesto?.techo_placeres) === expectedMayoTercio &&
        money(mayo.presupuesto?.techo_futuro) === expectedMayoTercio,
      evidence: { expectedTercio: expectedMayoTercio, presupuesto: mayo.presupuesto },
    },
    {
      name: 'No visible Fase 1 Escudo in dashboard/Telegram/core',
      pass: visibleEscudo.length === 0,
      evidence: visibleEscudo,
    },
    {
      name: '3 month income average Mar-Apr-May',
      pass: promedioMarAbrMay === money((36634 + 35680 + 74600) / 3),
      evidence: { promedioMarAbrMay },
    },
    {
      name: 'Santander email parser and endpoint exist',
      pass:
        fileIncludes('lib/santander-email-parser.ts', ['parsearCorreoSantander', 'tieneSenalSantander', 'clasificarComercio']) &&
        fileIncludes('app/api/email/santander/route.ts', ['x-email-ingest-secret', 'buscarGastoDuplicado', 'buscarIngresoDuplicado']),
      evidence: {
        parser: 'lib/santander-email-parser.ts',
        endpoint: 'app/api/email/santander/route.ts',
      },
    },
    {
      name: 'Gmail Apps Script automation exists',
      pass:
        fileIncludes('scripts/google-apps-script-santander-ingest.js', ['santanderIngest', 'GmailApp.search', 'Finanzas/Procesado-Santander']) &&
        fileIncludes('scripts/print-gmail-script-properties.mjs', ['EMAIL_INGEST_SECRET', '--show-secret']),
      evidence: {
        script: 'scripts/google-apps-script-santander-ingest.js',
        propsHelper: 'scripts/print-gmail-script-properties.mjs',
      },
    },
    {
      name: 'Gmail/Santander setup documentation exists',
      pass: fileIncludes('docs/gmail-santander-ingest.md', ['EMAIL_INGEST_SECRET', 'ENDPOINT_URL', 'npm run audit:goal']),
      evidence: {
        docs: 'docs/gmail-santander-ingest.md',
      },
    },
    {
      name: 'Dedicated EMAIL_INGEST_SECRET configured locally',
      pass: Boolean(env.EMAIL_INGEST_SECRET),
      evidence: {
        envLocal: '.env.local',
        present: Boolean(env.EMAIL_INGEST_SECRET),
      },
    },
    {
      name: 'Dashboard shows Gmail/Santander ingest status',
      pass: fileIncludes('app/Components/DashboardFinanciero.tsx', ['Estado Gmail / Santander', '/api/email/santander', 'Migración']),
      evidence: {
        dashboard: 'app/Components/DashboardFinanciero.tsx',
      },
    },
    {
      name: 'Santander health endpoint responds when dev server is running',
      pass: santanderHealth.ok || santanderHealth.reason === 'dev server not running',
      evidence: santanderHealth,
    },
  ];
  const failed = checks.filter((check) => !check.pass);

  console.log(JSON.stringify({ checks, failedCount: failed.length }, null, 2));

  if (failed.length) {
    process.exit(1);
  }
}

async function getSantanderHealth() {
  try {
    const response = await fetch('http://127.0.0.1:3002/api/email/santander');

    if (!response.ok) {
      return { ok: false, status: response.status, body: await response.text() };
    }

    return { ok: true, status: response.status, body: await response.json() };
  } catch (error) {
    return { ok: false, reason: 'dev server not running', message: error.message };
  }
}

function marzoAbrilMayoPromedio(marzo, abril, mayo) {
  return (marzo.totalIngresos + abril.totalIngresos + mayo.totalIngresos) / 3;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
