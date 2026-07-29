import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { categoriaParaGastos } from '@/lib/financial-core';
import { buildFinancialImportRow } from '@/lib/financial-import';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const runtime = 'nodejs';

const confirmationSchema = z.object({
  rows: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    include: z.boolean(),
    movementType: z.enum(['gasto', 'ingreso']),
    occurredAt: z.string(),
    description: z.string().max(160),
    amount: z.coerce.number(),
    category: z.enum(['Vida', 'Placeres', 'Futuro']),
    subcategory: z.string().max(80),
    currency: z.string().max(3),
  })).max(5_000),
});

type StoredRow = {
  id: number;
  row_index: number;
  source_data: Record<string, unknown> | null;
  status: string;
};

async function updateImportRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  profileId: string,
  batchId: string,
  ids: number[],
  payload: Record<string, unknown>,
) {
  for (let index = 0; index < ids.length; index += 400) {
    const result = await supabase.from('financial_import_rows').update(payload)
      .eq('profile_id', profileId).eq('batch_id', batchId).in('id', ids.slice(index, index + 400));
    if (result.error) throw result.error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  let profileId: string | null = null;
  let batchId = '';
  let claimed = false;
  try {
    if (!supabase) return NextResponse.json({ success: false, error: 'La importación no está disponible.' }, { status: 500 });
    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    ({ id: batchId } = await context.params);
    if (!/^[0-9a-f-]{36}$/i.test(batchId)) return NextResponse.json({ success: false, error: 'Importación inválida.' }, { status: 400 });
    const body = confirmationSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ success: false, error: 'Revisa las filas antes de confirmar.' }, { status: 400 });
    if (!body.data.rows.some((row) => row.include)) return NextResponse.json({ success: false, error: 'Selecciona al menos un movimiento válido.' }, { status: 400 });

    const batchResult = await supabase.from('financial_import_batches')
      .select('id, status, file_name')
      .eq('id', batchId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (batchResult.error) throw batchResult.error;
    if (!batchResult.data) return NextResponse.json({ success: false, error: 'No encontré esta importación.' }, { status: 404 });
    if (batchResult.data.status === 'confirmed') return NextResponse.json({ success: false, error: 'Esta importación ya fue confirmada.' }, { status: 409 });
    if (batchResult.data.status !== 'preview') return NextResponse.json({ success: false, error: 'Esta importación ya no se puede confirmar.' }, { status: 409 });
    const claim = await supabase.from('financial_import_batches')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('profile_id', profileId)
      .eq('status', 'preview')
      .select('id')
      .maybeSingle();
    if (claim.error) throw claim.error;
    if (!claim.data) return NextResponse.json({ success: false, error: 'Esta importación ya se está procesando.' }, { status: 409 });
    claimed = true;

    const storedResult = await supabase.from('financial_import_rows')
      .select('id, row_index, source_data, status')
      .eq('batch_id', batchId)
      .eq('profile_id', profileId);
    if (storedResult.error) throw storedResult.error;
    const storedById = new Map((storedResult.data as StoredRow[]).map((row) => [String(row.id), row]));
    const selected = body.data.rows.filter((row) => row.include);
    if (body.data.rows.some((row) => !storedById.has(String(row.id)))) {
      throw new Error('La previsualización cambió. Vuelve a cargar el archivo.');
    }

    const normalized = selected.map((input) => {
      const stored = storedById.get(String(input.id))!;
      const row = buildFinancialImportRow({
        rowIndex: stored.row_index,
        movementType: input.movementType,
        occurredAt: input.occurredAt,
        description: input.description,
        amount: input.amount,
        category: input.category,
        subcategory: input.subcategory,
        currency: input.currency,
        sourceData: stored.source_data || {},
      });
      if (row.status !== 'ready') throw new Error(`La fila ${stored.row_index} todavía tiene datos inválidos.`);
      return { id: stored.id, row };
    });
    const duplicateFingerprint = normalized.find((item, index) => normalized.findIndex((other) => other.row.fingerprint === item.row.fingerprint) !== index);
    if (duplicateFingerprint) throw new Error(`La fila ${duplicateFingerprint.row.rowIndex} está repetida en la selección.`);

    const fingerprints = normalized.map((item) => item.row.fingerprint);
    const existing = new Set<string>();
    for (let index = 0; index < fingerprints.length; index += 400) {
      const chunk = fingerprints.slice(index, index + 400);
      const [existingExpenses, existingIncome] = await Promise.all([
        supabase.from('gastos').select('import_fingerprint').eq('profile_id', profileId).in('import_fingerprint', chunk),
        supabase.from('ingresos').select('import_fingerprint').eq('profile_id', profileId).in('import_fingerprint', chunk),
      ]);
      if (existingExpenses.error) throw existingExpenses.error;
      if (existingIncome.error) throw existingIncome.error;
      [...(existingExpenses.data || []), ...(existingIncome.data || [])].forEach((row) => {
        if (row.import_fingerprint) existing.add(row.import_fingerprint);
      });
    }
    const importable = normalized.filter((item) => !existing.has(item.row.fingerprint));
    const skippedDuplicateIds = normalized.filter((item) => existing.has(item.row.fingerprint)).map((item) => item.id);
    const expenses = importable.filter((item) => item.row.movementType === 'gasto');
    const income = importable.filter((item) => item.row.movementType === 'ingreso');

    if (expenses.length) {
      for (let index = 0; index < expenses.length; index += 500) {
        const insert = await supabase.from('gastos').insert(expenses.slice(index, index + 500).map(({ row }) => ({
          profile_id: profileId,
          concepto: row.description,
          monto: row.amount,
          categoria: categoriaParaGastos(row.category),
          subcategoria: row.subcategory,
          origen: 'Archivo',
          fecha: row.occurredAt,
          import_batch_id: batchId,
          import_fingerprint: row.fingerprint,
        })));
        if (insert.error) throw insert.error;
      }
      await updateImportRows(supabase, profileId, batchId, expenses.map((item) => item.id), { status: 'imported', target_table: 'gastos', updated_at: new Date().toISOString() });
    }

    if (income.length) {
      for (let index = 0; index < income.length; index += 500) {
        const insert = await supabase.from('ingresos').insert(income.slice(index, index + 500).map(({ row }) => ({
          profile_id: profileId,
          concepto: row.description,
          monto: row.amount,
          tipo: row.subcategory || 'Importado',
          origen: 'Archivo',
          fecha: row.occurredAt,
          import_batch_id: batchId,
          import_fingerprint: row.fingerprint,
        })));
        if (insert.error) throw insert.error;
      }
      await updateImportRows(supabase, profileId, batchId, income.map((item) => item.id), { status: 'imported', target_table: 'ingresos', updated_at: new Date().toISOString() });
      const months = new Set(income.map((item) => item.row.occurredAt!.slice(0, 7)));
      for (const month of months) await sincronizarPresupuestoMensual(supabase, new Date(`${month}-15T12:00:00.000Z`), profileId);
    }

    const unselectedIds = body.data.rows.filter((row) => !row.include).map((row) => Number(row.id));
    if (unselectedIds.length) {
      await updateImportRows(supabase, profileId, batchId, unselectedIds, { status: 'skipped', updated_at: new Date().toISOString() });
    }
    if (skippedDuplicateIds.length) {
      await updateImportRows(supabase, profileId, batchId, skippedDuplicateIds, { status: 'duplicate', validation_errors: ['Este movimiento ya existe.'], updated_at: new Date().toISOString() });
    }
    const importedCount = expenses.length + income.length;
    const batchUpdate = await supabase.from('financial_import_batches').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      summary: { imported: importedCount, expenses: expenses.length, income: income.length, duplicates: skippedDuplicateIds.length, skipped: unselectedIds.length },
    }).eq('id', batchId).eq('profile_id', profileId).eq('status', 'processing');
    if (batchUpdate.error) throw batchUpdate.error;

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail: tenant.email,
      action: 'financial_import.confirm',
      resourceType: 'financial_import_batches',
      resourceId: batchId,
      metadata: { imported: importedCount, expenses: expenses.length, income: income.length, duplicates: skippedDuplicateIds.length, skipped: unselectedIds.length },
    });
    return NextResponse.json({ success: true, imported: importedCount, expenses: expenses.length, income: income.length, duplicates: skippedDuplicateIds.length, skipped: unselectedIds.length });
  } catch (error) {
    if (supabase && claimed && profileId && batchId) {
      await supabase.from('financial_import_batches').update({ status: 'preview', updated_at: new Date().toISOString() })
        .eq('id', batchId).eq('profile_id', profileId).eq('status', 'processing');
    }
    await logErrorEvent({ supabase, request, profileId, action: 'financial_import.confirm', error });
    const message = error instanceof Error ? error.message : 'No pude confirmar la importación.';
    return NextResponse.json({ success: false, error: message }, { status: /fila|selecci|repetida|inválid/i.test(message) ? 400 : 500 });
  }
}
