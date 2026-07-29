import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const expectedTables = [
  'profiles',
  'gastos',
  'ingresos',
  'presupuestos_mensuales',
  'fondos_acumulados',
  'abonos_tarjeta_credito',
  'telegram_accounts',
  'audit_events',
  'error_events',
];

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);

  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).trim().replace(/^"|"$/g, '')];
      })
  );
}

function host(value) {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

async function main() {
  const env = {
    ...loadEnvFile('.env.local'),
    ...loadEnvFile('.env.restore.local'),
    ...process.env,
  };
  const stagingUrl = env.STAGING_SUPABASE_URL || '';
  const stagingKey = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
  const productionUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.PRODUCTION_SUPABASE_URL || '';

  if (!stagingUrl || !stagingKey) {
    throw new Error('Faltan STAGING_SUPABASE_URL y STAGING_SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (productionUrl && host(stagingUrl) === host(productionUrl)) {
    throw new Error('Restore drill bloqueado: staging apunta al mismo proyecto que producción.');
  }

  const supabase = createClient(stagingUrl, stagingKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checks = [];

  for (const table of expectedTables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    checks.push({
      table,
      ok: !error,
      count: error ? null : count || 0,
      error: error?.message || null,
    });
  }

  const failed = checks.filter((check) => !check.ok);
  const report = {
    success: failed.length === 0,
    verifiedAt: new Date().toISOString(),
    stagingHost: host(stagingUrl),
    productionHostCompared: productionUrl ? host(productionUrl) : null,
    checks,
    nextChecks: [
      'Iniciar sesión con un usuario de staging.',
      'Abrir dashboard y confirmar conteos esperados.',
      'Registrar y borrar un gasto de prueba.',
      'Confirmar que producción no cambió.',
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
