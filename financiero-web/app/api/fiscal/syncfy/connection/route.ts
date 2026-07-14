import { NextResponse } from 'next/server';
import { syncfySatAllInOneSiteId } from '@/lib/fiscal-syncfy';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function extractString(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);

  try {
    if (!supabase) return NextResponse.json({ success: false, error: 'Servicio fiscal no configurado.' }, { status: 503 });
    if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as { event?: unknown; credentialId?: string };
    const credentialId = body.credentialId?.trim()
      || extractString(body.event, ['id_credential', 'idCredential', 'credential_id', 'credentialId']);
    if (!credentialId) return NextResponse.json({ success: false, error: 'Syncfy no devolvió la conexión fiscal.' }, { status: 400 });

    const profileResult = await supabase
      .from('fiscal_profiles')
      .select('id')
      .eq('profile_id', tenant.profileId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (!profileResult.data) return NextResponse.json({ success: false, error: 'Primero completa tu expediente fiscal.' }, { status: 409 });

    const now = new Date().toISOString();
    const result = await supabase
      .from('fiscal_integrations')
      .upsert({
        profile_id: tenant.profileId,
        fiscal_profile_id: profileResult.data.id,
        integration_type: 'open_fiscal',
        provider: 'syncfy',
        status: 'active',
        provider_connection_id: credentialId,
        last_error: null,
        metadata: {
          product: 'sat_all_in_one',
          siteId: syncfySatAllInOneSiteId,
          credentialsStoredBy: 'syncfy',
        },
        updated_at: now,
      }, { onConflict: 'profile_id,integration_type,provider' })
      .select('id, provider, status, provider_connection_id, last_sync_at')
      .single();
    if (result.error) throw new Error(result.error.message);

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'fiscal.syncfy.connection.upsert',
      resourceType: 'fiscal_integrations',
      resourceId: result.data.id,
      metadata: { provider: 'syncfy', product: 'sat_all_in_one' },
    });

    return NextResponse.json({ success: true, integration: result.data }, { status: 201 });
  } catch (error: unknown) {
    await logErrorEvent({ supabase, request, profileId: tenant.profileId, actorEmail: tenant.email, action: 'fiscal.syncfy.connection.upsert', error });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No pude guardar la conexión fiscal.' }, { status: 500 });
  }
}
