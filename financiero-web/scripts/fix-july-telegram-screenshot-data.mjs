import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const cwd = process.cwd();

function readEnv() {
  const envPaths = [
    path.join(cwd, '..', '.env'),
    path.join(cwd, '.env.local'),
    process.env.FINANCIERO_ENV_FILE || '',
  ].filter(Boolean);
  const env = { ...process.env };

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;

    for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).replace(/^export\s+/, '').trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
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

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function main() {
  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha, profile_id')
    .gte('fecha', '2026-07-01T00:00:00.000Z')
    .lt('fecha', '2026-07-03T00:00:00.000Z')
    .order('fecha', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = data || [];
  const falseWebExpenses = rows.filter((row) =>
    String(row.concepto || '').trim().toLowerCase() === 'actividades cabo' &&
    money(row.monto) === 500 &&
    String(row.origen || '').toLowerCase() === 'web'
  );
  const mercadoPagoToPleasure = rows.filter((row) =>
    ['MERCADOPAGO *MITZYANA', 'MERCADOPAGO *MIDNIGHT'].includes(String(row.concepto || '').trim().toUpperCase()) &&
    String(row.categoria) !== 'Placeres'
  );

  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      message: 'No se modificó nada. Revisa candidatos y corre con --apply si coinciden con las capturas.',
      falseWebExpenses,
      mercadoPagoToPleasure,
    }, null, 2));
    return;
  }

  const deletedIds = falseWebExpenses.map((row) => row.id);
  const reclassifiedIds = mercadoPagoToPleasure.map((row) => row.id);

  if (deletedIds.length) {
    const { error: deleteError } = await supabase.from('gastos').delete().in('id', deletedIds);
    if (deleteError) throw new Error(`No pude borrar falsos gastos web: ${deleteError.message}`);
  }

  if (reclassifiedIds.length) {
    const { error: updateError } = await supabase
      .from('gastos')
      .update({ categoria: 'Placeres', subcategoria: 'Otros Placeres' })
      .in('id', reclassifiedIds);
    if (updateError) throw new Error(`No pude reclasificar MercadoPago: ${updateError.message}`);
  }

  console.log(JSON.stringify({
    mode: 'apply',
    deletedFalseWebExpenses: deletedIds,
    reclassifiedMercadoPago: reclassifiedIds,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
