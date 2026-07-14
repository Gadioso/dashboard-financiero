import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const cardPayments = process.argv.includes('--card-payments');
const cwd = process.cwd();

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

async function main() {
  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const table = cardPayments ? 'abonos_tarjeta_credito' : 'ingresos';
  const columns = cardPayments
    ? 'id, concepto, monto, tarjeta, origen, fecha'
    : 'id, concepto, monto, tipo, fecha';
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .gte('fecha', '2026-01-01T00:00:00.000Z')
    .lt('fecha', '2027-01-01T00:00:00.000Z');

  if (error) throw new Error(error.message);

  const candidates = (data || []).filter(cardPayments ? looksLikeSuspiciousCardPayment : looksLikeInformationalIncome);

  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      table,
      message: 'No se borró nada. Revisa candidates y corre con --apply si estás seguro.',
      candidates,
    }, null, 2));
    return;
  }

  const ids = candidates.map((row) => row.id);

  if (!ids.length) {
    console.log(JSON.stringify({ mode: 'apply', table, deleted: 0, candidates: [] }, null, 2));
    return;
  }

  const { error: deleteError } = await supabase.from(table).delete().in('id', ids);

  if (deleteError) throw new Error(deleteError.message);

  console.log(JSON.stringify({ mode: 'apply', table, deleted: ids.length, ids }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
