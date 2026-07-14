import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

const regimes = new Set(['601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616', '620', '621', '622', '623', '624', '625', '626']);

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Servicio fiscal no configurado.' }, { status: 503 });
  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rfc = String(body.rfc || '').trim().toUpperCase();
  const legalName = String(body.legalName || '').trim();
  const taxRegime = String(body.taxRegime || '').trim().toUpperCase();
  const fiscalPostalCode = String(body.fiscalPostalCode || '').trim();
  if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return NextResponse.json({ success: false, error: 'RFC inválido.' }, { status: 400 });
  if (!legalName) return NextResponse.json({ success: false, error: 'La razón social es obligatoria.' }, { status: 400 });
  if (!regimes.has(taxRegime)) return NextResponse.json({ success: false, error: 'Régimen fiscal no soportado.' }, { status: 400 });
  if (!/^\d{5}$/.test(fiscalPostalCode)) return NextResponse.json({ success: false, error: 'Código postal fiscal inválido.' }, { status: 400 });

  const payload = { profile_id: tenant.profileId, rfc, legal_name: legalName.slice(0, 180), tax_regime: taxRegime, fiscal_postal_code: fiscalPostalCode, status: 'active', updated_at: new Date().toISOString() };
  const existing = await supabase.from('fiscal_profiles').select('id').eq('profile_id', tenant.profileId).eq('status', 'active').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const result = existing.data?.id
    ? await supabase.from('fiscal_profiles').update(payload).eq('id', existing.data.id).eq('profile_id', tenant.profileId).select('*').single()
    : await supabase.from('fiscal_profiles').insert(payload).select('*').single();
  if (result.error) return NextResponse.json({ success: false, error: /does not exist|schema cache/i.test(result.error.message) ? 'Falta aplicar la migración SAT Core.' : 'No pude guardar el perfil fiscal.' }, { status: /does not exist|schema cache/i.test(result.error.message) ? 409 : 500 });

  await logAuditEvent({ supabase, request, profileId: tenant.profileId, actorEmail: tenant.email, action: 'fiscal_profile.upsert', resourceType: 'fiscal_profile', resourceId: result.data.id, metadata: { rfc, taxRegime } });
  return NextResponse.json({ success: true, profile: result.data });
}
