import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { getSyncfyStampingReadiness, issueSyncfyInvoice, normalizeStampingResponse } from '@/lib/syncfy-stamping';

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const { data, error } = await supabase.from('fiscal_operations').select('id, operation_type, status, provider, provider_transaction_id, cfdi_uuid, request_payload, response_metadata, error_message, created_at').eq('profile_id', tenant.profileId).in('operation_type', ['issue', 'credit_note', 'payment_complement']).order('created_at', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ success: false, error: 'No pude consultar las facturas.' }, { status: 500 });
  const stamping = getSyncfyStampingReadiness();
  return NextResponse.json({ success: true, stampingProvider: 'syncfy', stampingConfigured: stamping.ready, stampingMissing: stamping.missing, invoices: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as {
    customer?: Record<string, unknown>;
    item?: Record<string, unknown>;
    confirmStamp?: boolean;
    paymentForm?: string;
    paymentMethod?: string;
    use?: string;
  };
  const customer = body.customer || {};
  const item = body.item || {};
  if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(String(customer.tax_id || ''))) return NextResponse.json({ success: false, error: 'RFC del receptor inválido.' }, { status: 400 });
  if (!customer.legal_name || !/^\d{5}$/.test(String(customer.zip || '')) || !/^\d{3}$/.test(String(customer.tax_system || ''))) return NextResponse.json({ success: false, error: 'Completa razón social, régimen y código postal del receptor.' }, { status: 400 });
  if (!item.description || Number(item.price) <= 0 || !/^\d{8}$/.test(String(item.product_key || ''))) return NextResponse.json({ success: false, error: 'Completa concepto, importe y clave SAT de producto.' }, { status: 400 });

  const confirmStamp = body.confirmStamp === true;
  const readiness = getSyncfyStampingReadiness();
  if (confirmStamp && !readiness.ready) return NextResponse.json({ success: false, error: `Syncfy Stamping aún no está listo. Falta: ${readiness.missing.join(', ')}.` }, { status: 409 });
  const fiscalProfile = await supabase.from('fiscal_profiles').select('id').eq('profile_id', tenant.profileId).eq('status', 'active').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!fiscalProfile.data) return NextResponse.json({ success: false, error: 'Primero completa tu expediente fiscal.' }, { status: 409 });
  const idempotencyKey = randomUUID();
  const stampingPayload = {
    customer: { legal_name: String(customer.legal_name).trim(), tax_id: String(customer.tax_id).trim().toUpperCase(), tax_system: String(customer.tax_system), address: { zip: String(customer.zip), country: 'MEX' }, email: customer.email || undefined },
    items: [{ quantity: Number(item.quantity || 1), product: { description: String(item.description).trim(), product_key: String(item.product_key), price: Number(item.price), tax_included: item.tax_included !== false, taxability: '02', taxes: [{ type: 'IVA', rate: Number(item.vat_rate ?? 0.16) }], unit_key: item.unit_key || 'E48', unit_name: item.unit_name || 'Servicio' } }],
    payment_form: String(body.paymentForm || '03'), payment_method: body.paymentMethod === 'PPD' ? 'PPD' : 'PUE', use: String(body.use || 'G03'), currency: 'MXN', type: 'I', status: 'draft', idempotency_key: idempotencyKey,
  };
  const initial = await supabase.from('fiscal_operations').insert({ profile_id: tenant.profileId, fiscal_profile_id: fiscalProfile.data.id, operation_type: 'issue', status: confirmStamp ? 'queued' : 'draft', provider: 'syncfy', request_payload: stampingPayload, response_metadata: { explicitConfirmation: confirmStamp, idempotencyKey, product: 'syncfy_stamping' } }).select('id').single();
  if (initial.error) return NextResponse.json({ success: false, error: 'No pude guardar la factura.' }, { status: 500 });
  if (!confirmStamp) return NextResponse.json({ success: true, stamped: false, provider: 'syncfy', operationId: initial.data.id }, { status: 201 });

  try {
    const providerResponse = await issueSyncfyInvoice(stampingPayload, idempotencyKey);
    const normalized = normalizeStampingResponse(providerResponse);
    const status = normalized.uuid ? 'stamped' : 'processing';
    const updated = await supabase.from('fiscal_operations').update({ status, provider_transaction_id: normalized.providerTransactionId, cfdi_uuid: normalized.uuid, response_metadata: { idempotencyKey, product: 'syncfy_stamping', providerResponse }, attempt_count: 1, updated_at: new Date().toISOString() }).eq('id', initial.data.id).eq('profile_id', tenant.profileId);
    if (updated.error) throw new Error(updated.error.message);
    return NextResponse.json({ success: true, stamped: status === 'stamped', processing: status === 'processing', provider: 'syncfy', operationId: initial.data.id, uuid: normalized.uuid }, { status: status === 'stamped' ? 201 : 202 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Syncfy no pudo timbrar la factura.';
    await supabase.from('fiscal_operations').update({ status: 'failed', error_message: message, attempt_count: 1, updated_at: new Date().toISOString() }).eq('id', initial.data.id).eq('profile_id', tenant.profileId);
    return NextResponse.json({ success: false, error: message, operationId: initial.data.id }, { status: 502 });
  }
}
