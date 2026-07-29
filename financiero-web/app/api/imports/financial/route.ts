import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import {
  MAX_FINANCIAL_IMPORT_BYTES,
  parseTabularFinancialImport,
  sourceTypeForFile,
  type FinancialImportRow,
} from '@/lib/financial-import';
import { parsePdfFinancialImport } from '@/lib/financial-import-pdf';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const runtime = 'nodejs';

function cleanFileName(value: string) {
  const cleaned = value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'documento').slice(-140);
}

function isMissingImportSchema(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /financial_import_|schema cache|could not find/i.test(error?.message || '');
}

async function findExistingFingerprints(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  profileId: string,
  fingerprints: string[],
) {
  const existing = new Set<string>();
  for (let index = 0; index < fingerprints.length; index += 400) {
    const chunk = fingerprints.slice(index, index + 400);
    const [expenses, income] = await Promise.all([
      supabase.from('gastos').select('import_fingerprint').eq('profile_id', profileId).in('import_fingerprint', chunk),
      supabase.from('ingresos').select('import_fingerprint').eq('profile_id', profileId).in('import_fingerprint', chunk),
    ]);
    if (expenses.error && !/import_fingerprint|schema cache|could not find/i.test(expenses.error.message)) throw expenses.error;
    if (income.error && !/import_fingerprint|schema cache|could not find/i.test(income.error.message)) throw income.error;
    [...(expenses.data || []), ...(income.data || [])].forEach((row) => {
      if (row.import_fingerprint) existing.add(row.import_fingerprint);
    });
  }
  return existing;
}

function summarize(rows: FinancialImportRow[]) {
  const importable = rows.filter((row) => row.status === 'ready');
  return {
    rows: rows.length,
    ready: importable.length,
    duplicates: rows.filter((row) => row.status === 'duplicate').length,
    errors: rows.filter((row) => row.status === 'invalid').length,
    income: importable.filter((row) => row.movementType === 'ingreso').reduce((total, row) => total + (row.amount || 0), 0),
    expenses: importable.filter((row) => row.movementType === 'gasto').reduce((total, row) => total + (row.amount || 0), 0),
    firstDate: importable.map((row) => row.occurredAt).filter(Boolean).sort()[0] || null,
    lastDate: importable.map((row) => row.occurredAt).filter(Boolean).sort().at(-1) || null,
  };
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let profileId: string | null = null;
  let uploadedPath = '';
  let createdBatchId = '';

  try {
    if (!supabase) return NextResponse.json({ success: false, error: 'La importación no está disponible.' }, { status: 500 });
    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const formData = await request.formData();
    const fileValue = formData.get('file');
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ success: false, error: 'Selecciona un archivo para importar.' }, { status: 400 });
    }
    if (fileValue.size <= 0 || fileValue.size > MAX_FINANCIAL_IMPORT_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo debe pesar entre 1 byte y 10 MB.' }, { status: 400 });
    }
    const sourceType = sourceTypeForFile(fileValue);
    if (!sourceType) {
      return NextResponse.json({ success: false, error: 'Formato no compatible. Usa .xlsx, .csv o .pdf.' }, { status: 400 });
    }

    const parsed = sourceType === 'pdf'
      ? await parsePdfFinancialImport(fileValue)
      : await parseTabularFinancialImport(fileValue);
    const readyFingerprints = parsed.rows.filter((row) => row.status === 'ready').map((row) => row.fingerprint);
    const existing = await findExistingFingerprints(supabase, profileId, readyFingerprints);
    parsed.rows.forEach((row) => {
      if (row.status === 'ready' && existing.has(row.fingerprint)) {
        row.status = 'duplicate';
        row.validationErrors = ['Este movimiento ya fue importado anteriormente.'];
      }
    });

    const batchId = randomUUID();
    createdBatchId = batchId;
    const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
    uploadedPath = `${profileId}/${batchId}/${cleanFileName(fileValue.name)}`;
    const upload = await supabase.storage.from('financial-imports').upload(uploadedPath, fileBuffer, {
      contentType: fileValue.type || (sourceType === 'pdf' ? 'application/pdf' : sourceType === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      upsert: false,
    });
    if (upload.error) throw new Error(`No pude resguardar el archivo original: ${upload.error.message}`);

    const summary = summarize(parsed.rows);
    const batchInsert = await supabase.from('financial_import_batches').insert({
      id: batchId,
      profile_id: profileId,
      file_name: fileValue.name.slice(0, 255),
      file_type: fileValue.type || 'application/octet-stream',
      file_size: fileValue.size,
      source_type: parsed.sourceType,
      storage_path: uploadedPath,
      detected_mapping: parsed.detectedMapping,
      summary,
      row_count: parsed.rows.length,
      valid_count: summary.ready,
      duplicate_count: summary.duplicates,
      error_count: summary.errors,
    }).select('id, file_name, source_type, status, detected_mapping, summary, created_at').single();
    if (batchInsert.error) {
      if (isMissingImportSchema(batchInsert.error)) throw new Error('La función de importación todavía no está habilitada en la base de datos.');
      throw batchInsert.error;
    }

    for (let index = 0; index < parsed.rows.length; index += 500) {
      const insert = await supabase.from('financial_import_rows').insert(parsed.rows.slice(index, index + 500).map((row) => ({
        batch_id: batchId,
        profile_id: profileId,
        row_index: row.rowIndex,
        movement_type: row.movementType,
        occurred_at: row.occurredAt,
        description: row.description,
        amount: row.amount,
        category: row.category,
        subcategory: row.subcategory,
        currency: row.currency,
        status: row.status,
        validation_errors: row.validationErrors,
        fingerprint: row.fingerprint,
        source_data: row.sourceData,
      })));
      if (insert.error) throw insert.error;
    }
    const rowsResult = await supabase.from('financial_import_rows')
      .select('id, row_index, movement_type, occurred_at, description, amount, category, subcategory, currency, status, validation_errors')
      .eq('profile_id', profileId)
      .eq('batch_id', batchId)
      .order('row_index');
    if (rowsResult.error) throw rowsResult.error;

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail: tenant.email,
      action: 'financial_import.preview',
      resourceType: 'financial_import_batches',
      resourceId: batchId,
      metadata: { sourceType, fileName: fileValue.name, ...summary },
    });
    return NextResponse.json({ success: true, batch: batchInsert.data, rows: rowsResult.data });
  } catch (error) {
    if (supabase && createdBatchId && profileId) {
      await supabase.from('financial_import_batches').delete().eq('id', createdBatchId).eq('profile_id', profileId);
    }
    if (supabase && uploadedPath) await supabase.storage.from('financial-imports').remove([uploadedPath]);
    await logErrorEvent({ supabase, request, profileId, action: 'financial_import.preview', error });
    const message = error instanceof Error ? error.message : 'No pude analizar el archivo.';
    return NextResponse.json({ success: false, error: message }, { status: /compatible|columnas|archivo|movimientos|límite|limite/i.test(message) ? 400 : 500 });
  }
}
