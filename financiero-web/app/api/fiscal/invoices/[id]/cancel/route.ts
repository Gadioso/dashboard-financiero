import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { cancelSyncfyInvoice, getSyncfyStampingReadiness, normalizeStampingResponse } from '@/lib/syncfy-stamping';

const motives = new Set(['01', '02', '03', '04']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const readiness = getSyncfyStampingReadiness();
  if (!readiness.ready) return NextResponse.json({ success: false, error: `Syncfy Stamping aún no está listo. Falta: ${readiness.missing.join(', ')}.` }, { status: 409 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { motive?: string; substitution?: string; confirm?: boolean };
  if (!body.confirm) return NextResponse.json({ success: false, error: 'La cancelación requiere confirmación explícita.' }, { status: 400 });
  if (!motives.has(body.motive || '')) return NextResponse.json({ success: false, error: 'Motivo SAT inválido.' }, { status: 400 });
  if (body.motive === '01' && !body.substitution?.trim()) return NextResponse.json({ success: false, error: 'El motivo 01 requiere el UUID o ID sustituto.' }, { status: 400 });
  const existing = await supabase.from('fiscal_operations').select('id, fiscal_profile_id, provider_transaction_id, cfdi_uuid, status').eq('id', id).eq('profile_id', tenant.profileId).eq('operation_type', 'issue').maybeSingle();
  if (!existing.data?.provider_transaction_id) return NextResponse.json({ success: false, error: 'La factura no tiene un identificador PAC cancelable.' }, { status: 409 });
  const idempotencyKey = randomUUID();
  const payload = { motive: body.motive, substitution: body.substitution?.trim() || undefined, uuid: existing.data.cfdi_uuid || undefined };
  const operation = await supabase.from('fiscal_operations').insert({ profile_id: tenant.profileId, fiscal_profile_id: existing.data.fiscal_profile_id, operation_type: 'cancel', status: 'processing', provider: 'syncfy', provider_transaction_id: existing.data.provider_transaction_id, cfdi_uuid: existing.data.cfdi_uuid, cancellation_reason: body.motive, replacement_uuid: body.substitution?.trim() || null, request_payload: payload, response_metadata: { explicitConfirmation: true, idempotencyKey, product: 'syncfy_stamping' } }).select('id').single();
  if (operation.error) return NextResponse.json({ success: false, error: 'No pude registrar la cancelación.' }, { status: 500 });
  try {
    const providerResponse = await cancelSyncfyInvoice(existing.data.provider_transaction_id, payload, idempotencyKey);
    const normalized = normalizeStampingResponse(providerResponse);
    const updated = await supabase.from('fiscal_operations').update({ status: 'cancelled', response_metadata: { idempotencyKey, product: 'syncfy_stamping', providerResponse }, attempt_count: 1, updated_at: new Date().toISOString() }).eq('id', operation.data.id).eq('profile_id', tenant.profileId);
    if (updated.error) throw new Error(updated.error.message);
    await supabase.from('fiscal_operations').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('profile_id', tenant.profileId);
    return NextResponse.json({ success: true, cancelled: true, operationId: operation.data.id, providerTransactionId: normalized.providerTransactionId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Syncfy no pudo cancelar la factura.';
    await supabase.from('fiscal_operations').update({ status: 'failed', error_message: message, attempt_count: 1, updated_at: new Date().toISOString() }).eq('id', operation.data.id).eq('profile_id', tenant.profileId);
    return NextResponse.json({ success: false, error: message, operationId: operation.data.id }, { status: 502 });
  }
}
