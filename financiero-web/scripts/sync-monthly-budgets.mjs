import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const apply = process.argv.includes('--apply');
const year = Number(process.env.BUDGET_SYNC_YEAR || 2026);

function readEnv() {
  const env = { ...process.env };
  const envPaths = [path.join(cwd, '..', '.env'), path.join(cwd, '.env.local')];

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

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function main() {
  const env = readEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  const [{ data: ingresos, error: ingresosError }, { data: presupuestos, error: presupuestosError }] = await Promise.all([
    supabase.from('ingresos').select('monto, fecha, profile_id').gte('fecha', start).lt('fecha', end),
    supabase.from('presupuestos_mensuales').select('id, mes_anio, profile_id, techo_vida, techo_placeres, techo_futuro'),
  ]);

  if (ingresosError || presupuestosError) {
    throw new Error((ingresosError || presupuestosError).message);
  }

  const plans = [];
  const existingBudgetKeys = new Set();

  for (const presupuesto of presupuestos || []) {
    const mes = String(presupuesto.mes_anio || '').slice(0, 7);
    if (!mes.startsWith(String(year))) continue;

    existingBudgetKeys.add(`${presupuesto.profile_id || ''}|${mes}`);

    const totalIngresos = money((ingresos || [])
      .filter((ingreso) => {
        const sameMonth = String(ingreso.fecha || '').slice(0, 7) === mes;
        const sameProfile = presupuesto.profile_id
          ? ingreso.profile_id === presupuesto.profile_id
          : !ingreso.profile_id;

        return sameMonth && sameProfile;
      })
      .reduce((sum, ingreso) => sum + Number(ingreso.monto || 0), 0));
    const tercio = money(totalIngresos / 3);
    const current = {
      Vida: money(presupuesto.techo_vida),
      Placeres: money(presupuesto.techo_placeres),
      Futuro: money(presupuesto.techo_futuro),
    };
    const next = { Vida: tercio, Placeres: tercio, Futuro: tercio };
    const changed = current.Vida !== next.Vida || current.Placeres !== next.Placeres || current.Futuro !== next.Futuro;

    if (!changed) continue;

    plans.push({
      action: 'update',
      id: presupuesto.id,
      mes,
      profileId: presupuesto.profile_id || null,
      totalIngresos,
      current,
      next,
    });
  }

  const incomeGroups = new Map();

  for (const ingreso of ingresos || []) {
    const mes = String(ingreso.fecha || '').slice(0, 7);
    if (!mes.startsWith(String(year))) continue;

    const key = `${ingreso.profile_id || ''}|${mes}`;
    const current = incomeGroups.get(key) || {
      mes,
      profileId: ingreso.profile_id || null,
      totalIngresos: 0,
    };

    current.totalIngresos = money(current.totalIngresos + Number(ingreso.monto || 0));
    incomeGroups.set(key, current);
  }

  for (const [key, group] of incomeGroups) {
    if (existingBudgetKeys.has(key)) continue;

    const tercio = money(group.totalIngresos / 3);

    plans.push({
      action: 'insert',
      id: null,
      mes: group.mes,
      profileId: group.profileId,
      totalIngresos: group.totalIngresos,
      current: null,
      next: { Vida: tercio, Placeres: tercio, Futuro: tercio },
    });
  }

  if (apply) {
    for (const plan of plans) {
      const payload = {
        mes_anio: `${plan.mes}-01`,
        profile_id: plan.profileId,
        techo_vida: plan.next.Vida,
        techo_placeres: plan.next.Placeres,
        techo_futuro: plan.next.Futuro,
        fase_ahorro: 'Regla 33/33/33 activa',
      };
      const query = plan.action === 'insert'
        ? supabase.from('presupuestos_mensuales').insert([payload])
        : supabase
          .from('presupuestos_mensuales')
          .update(payload)
          .eq('id', plan.id);
      const { error } = await query;

      if (error) throw new Error(`No pude actualizar presupuesto ${plan.id}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    year,
    changed: plans.length,
    plans,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
