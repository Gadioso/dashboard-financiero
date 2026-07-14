import { NextResponse } from 'next/server';
import { calculateFiscalProjection, projectionRegimeFromSatCode } from '@/lib/fiscal-projection';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { getSyncfyStampingReadiness } from '@/lib/syncfy-stamping';

export const dynamic = 'force-dynamic';

function missingTable(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function monthBounds(month: string | null) {
  const valid = /^\d{4}-\d{2}$/.test(month || '') ? month! : new Date().toISOString().slice(0, 7);
  const start = `${valid}-01T00:00:00.000Z`;
  const next = new Date(`${valid}-01T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { month: valid, start, end: next.toISOString() };
}

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Servicio fiscal no configurado.' }, { status: 503 });

  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bounds = monthBounds(searchParams.get('month'));
  const [profileResult, integrationsResult, opinionsResult, alertsResult, documentsResult, providerDocumentsResult, operationsResult] = await Promise.all([
    supabase.from('fiscal_profiles').select('id, business_entity_id, rfc, legal_name, tax_regime, fiscal_postal_code, status, updated_at').eq('profile_id', tenant.profileId).eq('status', 'active').limit(1).maybeSingle(),
    supabase.from('fiscal_integrations').select('id, integration_type, provider, status, last_sync_at, last_error, metadata, updated_at').eq('profile_id', tenant.profileId).order('updated_at', { ascending: false }),
    supabase.from('fiscal_compliance_opinions').select('id, opinion_status, checked_at, valid_until, omitted_obligations, source').eq('profile_id', tenant.profileId).order('checked_at', { ascending: false }).limit(1),
    supabase.from('fiscal_alerts').select('id, alert_type, severity, title, description, status, detected_at, metadata').eq('profile_id', tenant.profileId).eq('status', 'active').order('detected_at', { ascending: false }).limit(20),
    supabase.from('cfdi_documents').select('id, document_direction, status, total, tax_transferred, tax_withheld, issue_date').eq('profile_id', tenant.profileId).gte('issue_date', bounds.start).lt('issue_date', bounds.end),
    supabase.from('fiscal_provider_documents').select('id, document_type, status, file_name, mime_type, period, issued_at, created_at').eq('profile_id', tenant.profileId).order('issued_at', { ascending: false, nullsFirst: false }).limit(50),
    supabase.from('fiscal_operations').select('id, operation_type, status, provider, provider_transaction_id, cfdi_uuid, created_at, error_message').eq('profile_id', tenant.profileId).order('created_at', { ascending: false }).limit(10),
  ]);

  const fiscalFoundationReady = ![profileResult.error, integrationsResult.error, opinionsResult.error, alertsResult.error, providerDocumentsResult.error, operationsResult.error].some(missingTable);
  if (documentsResult.error && !missingTable(documentsResult.error)) {
    return NextResponse.json({ success: false, error: 'No pude leer los CFDI.' }, { status: 500 });
  }

  const documents = missingTable(documentsResult.error) ? [] : documentsResult.data || [];
  const providerDocuments = missingTable(providerDocumentsResult.error) ? [] : providerDocumentsResult.data || [];
  const active = documents.filter((document) => document.status === 'active');
  const issued = active.filter((document) => document.document_direction === 'issued');
  const received = active.filter((document) => document.document_direction === 'received');
  const collectedIncome = issued.reduce((sum, document) => sum + Number(document.total || 0), 0);
  const paidExpenses = received.reduce((sum, document) => sum + Number(document.total || 0), 0);
  const vatTransferred = issued.reduce((sum, document) => sum + Number(document.tax_transferred || 0), 0);
  const vatCreditable = received.reduce((sum, document) => sum + Number(document.tax_transferred || 0), 0);
  const regime = projectionRegimeFromSatCode(profileResult.data?.tax_regime);

  const stamping = getSyncfyStampingReadiness();

  return NextResponse.json({
    success: true,
    month: bounds.month,
    fiscalFoundationReady,
    profile: missingTable(profileResult.error) ? null : profileResult.data,
    integrations: missingTable(integrationsResult.error) ? [] : integrationsResult.data || [],
    complianceOpinion: missingTable(opinionsResult.error) ? null : opinionsResult.data?.[0] || null,
    alerts: missingTable(alertsResult.error) ? [] : alertsResult.data || [],
    operations: missingTable(operationsResult.error) ? [] : operationsResult.data || [],
    capabilities: {
      openFiscalConfigured: Boolean(process.env.SYNCFY_API_KEY?.trim()),
      stampingConfigured: stamping.ready,
      stampingMissing: stamping.missing,
    },
    fiscalDocuments: providerDocuments,
    fiscalDocumentSummary: {
      total: providerDocuments.length,
      declarations: providerDocuments.filter((document) => document.document_type === 'monthly_declaration' || document.document_type === 'annual_declaration').length,
      certificates: providerDocuments.filter((document) => document.document_type === 'tax_status_certificate').length,
      opinions: providerDocuments.filter((document) => document.document_type === 'compliance_opinion').length,
      withholdings: providerDocuments.filter((document) => document.document_type === 'withholding').length,
    },
    cfdiSummary: { total: active.length, issued: issued.length, received: received.length, cancelled: documents.length - active.length },
    projection: calculateFiscalProjection({ regime, collectedIncome, paidExpenses, vatTransferred, vatCreditable }),
  });
}
