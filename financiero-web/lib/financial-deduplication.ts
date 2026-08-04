import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinancialImportRow } from '@/lib/financial-import';

/** Exact, profile-scoped duplicate guard used before any conversational write. */
export async function excludeDuplicateFinancialRows({
  supabase,
  profileId,
  rows,
}: {
  supabase: SupabaseClient;
  profileId: string;
  rows: FinancialImportRow[];
}) {
  const accepted: FinancialImportRow[] = [];
  const duplicates: FinancialImportRow[] = [];
  const fingerprints = new Set<string>();

  for (const row of rows) {
    if (row.status !== 'ready' || !row.occurredAt || row.amount === null || fingerprints.has(row.fingerprint)) {
      duplicates.push(row);
      continue;
    }
    fingerprints.add(row.fingerprint);
    const start = `${row.occurredAt.slice(0, 10)}T00:00:00.000Z`;
    const end = `${row.occurredAt.slice(0, 10)}T23:59:59.999Z`;
    const table = row.movementType === 'ingreso' ? 'ingresos' : 'gastos';
    let query = supabase.from(table).select('id').eq('profile_id', profileId).eq('monto', row.amount).ilike('concepto', row.description).gte('fecha', start).lte('fecha', end).limit(1);
    if (row.movementType === 'gasto') query = query.eq('categoria', row.category);
    const { data, error } = await query;
    if (error) throw error;
    if (data?.length) duplicates.push(row);
    else accepted.push(row);
  }
  return { accepted, duplicates };
}
