import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const cwd = process.cwd();

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

function looksLikeInformationalIncome(row) {
  const concept = String(row.concepto || '').toLowerCase();

  return /(?:tu cuenta|puedes consultar|estimado cliente|notificaci[oó]n santander|atentamente|santander m[eé]xico|informaci[oó]n|sin concepto)/i.test(concept);
}

async function main() {
  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('ingresos')
    .select('id, concepto, monto, tipo, fecha')
    .gte('fecha', '2026-01-01T00:00:00.000Z')
    .lt('fecha', '2027-01-01T00:00:00.000Z');

  if (error) throw new Error(error.message);

  const candidates = (data || []).filter(looksLikeInformationalIncome);

  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      message: 'No se borró nada. Revisa candidates y corre con --apply si estás seguro.',
      candidates,
    }, null, 2));
    return;
  }

  const ids = candidates.map((row) => row.id);

  if (!ids.length) {
    console.log(JSON.stringify({ mode: 'apply', deleted: 0, candidates: [] }, null, 2));
    return;
  }

  const { error: deleteError } = await supabase.from('ingresos').delete().in('id', ids);

  if (deleteError) throw new Error(deleteError.message);

  console.log(JSON.stringify({ mode: 'apply', deleted: ids.length, ids }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
