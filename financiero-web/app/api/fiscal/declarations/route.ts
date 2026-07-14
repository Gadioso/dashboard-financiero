import { NextResponse } from 'next/server';
import { calculateFiscalProjection, projectionRegimeFromSatCode } from '@/lib/fiscal-projection';
import { logAuditEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

function periodBounds(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const start = new Date(`${period}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const { data, error } = await supabase.from('fiscal_declaration_drafts').select('*').eq('profile_id', tenant.profileId).order('period', { ascending: false }).limit(24);
  if (error) return NextResponse.json({ success: false, error: 'No pude consultar las declaraciones preparadas.' }, { status: 500 });
  return NextResponse.json({ success: true, declarations: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { period?: string };
  const period = body.period || '';
  const bounds = periodBounds(period);
  if (!bounds) return NextResponse.json({ success: false, error: 'Periodo inválido.' }, { status: 400 });
  const [profileResult, documentsResult] = await Promise.all([
    supabase.from('fiscal_profiles').select('id, tax_regime').eq('profile_id', tenant.profileId).eq('status', 'active').limit(1).maybeSingle(),
    supabase.from('cfdi_documents').select('document_direction, status, total, tax_transferred, tax_withheld').eq('profile_id', tenant.profileId).gte('issue_date', bounds.start).lt('issue_date', bounds.end),
  ]);
  if (!profileResult.data) return NextResponse.json({ success: false, error: 'Primero completa tu expediente fiscal.' }, { status: 409 });
  if (documentsResult.error) return NextResponse.json({ success: false, error: 'No pude leer los CFDI del periodo.' }, { status: 500 });
  const active = (documentsResult.data || []).filter((row) => row.status === 'active');
  const issued = active.filter((row) => row.document_direction === 'issued');
  const received = active.filter((row) => row.document_direction === 'received');
  const projection = calculateFiscalProjection({ regime: projectionRegimeFromSatCode(profileResult.data.tax_regime), collectedIncome: issued.reduce((sum, row) => sum + Number(row.total || 0), 0), paidExpenses: received.reduce((sum, row) => sum + Number(row.total || 0), 0), vatTransferred: issued.reduce((sum, row) => sum + Number(row.tax_transferred || 0), 0), vatCreditable: received.reduce((sum, row) => sum + Number(row.tax_transferred || 0), 0) });
  const payload = { profile_id: tenant.profileId, fiscal_profile_id: profileResult.data.id, period, declaration_type: 'monthly_provisional', status: 'prepared', calculated_values: projection, source_summary: { cfdiCount: active.length, issuedCount: issued.length, receivedCount: received.length }, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('fiscal_declaration_drafts').upsert(payload, { onConflict: 'profile_id,period,declaration_type' }).select('*').single();
  if (error) return NextResponse.json({ success: false, error: 'No pude preparar la declaración.' }, { status: 500 });
  await logAuditEvent({ supabase, request, profileId: tenant.profileId, actorEmail: tenant.email, action: 'fiscal_declaration.prepare', resourceType: 'fiscal_declaration_draft', resourceId: data.id, metadata: { period } });
  return NextResponse.json({ success: true, declaration: data, filingMode: 'review_required', satPortalUrl: 'https://www.sat.gob.mx/personas/declaraciones' }, { status: 201 });
}
