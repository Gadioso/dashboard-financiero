import { NextResponse } from 'next/server';
import { assertBillingLimit, BillingLimitError } from '@/lib/billing';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type SyncfyConnectionBody = {
  bankName?: string;
  country?: string;
  credentialId?: string;
  siteId?: string;
  siteName?: string;
  event?: unknown;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed || null;
}

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

function buildProviderItemId(body: SyncfyConnectionBody) {
  const event = body.event;
  const credentialId = cleanText(body.credentialId) || extractString(event, ['id_credential', 'idCredential', 'credential_id', 'credentialId']);
  const siteId = cleanText(body.siteId) || extractString(event, ['id_site', 'idSite', 'site_id', 'siteId']);

  if (credentialId) return credentialId;
  if (siteId && body.bankName) return `${siteId}:${body.bankName.trim().toLowerCase()}`;

  return null;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json()) as SyncfyConnectionBody;
    const bankName = cleanText(body.bankName) || cleanText(body.siteName) || extractString(body.event, ['site_name', 'siteName', 'name']) || 'Banco conectado';
    const country = cleanText(body.country) || 'MX';
    const providerItemId = buildProviderItemId(body);

    const existingQuery = supabase
      .from('bank_connections')
      .select('id')
      .eq('profile_id', tenant.profileId)
      .eq('provider', 'syncfy')
      .eq('status', 'active');

    const existingByProviderItem = providerItemId
      ? await existingQuery.eq('provider_item_id', providerItemId).maybeSingle()
      : { data: null, error: null };

    if (existingByProviderItem.error) {
      throw new Error(existingByProviderItem.error.message);
    }

    const existingByInstitution = !existingByProviderItem.data?.id
      ? await supabase
          .from('bank_connections')
          .select('id')
          .eq('profile_id', tenant.profileId)
          .eq('provider', 'syncfy')
          .eq('institution_name', bankName)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

    if (existingByInstitution.error) {
      throw new Error(existingByInstitution.error.message);
    }

    const existingId = existingByProviderItem.data?.id || existingByInstitution.data?.id;

    if (!existingId) {
      const { count, error: countError } = await supabase
        .from('bank_connections')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', tenant.profileId)
        .eq('status', 'active');

      if (countError) throw new Error(countError.message);

      await assertBillingLimit({
        supabase,
        profileId: tenant.profileId,
        resource: 'bankConnections',
        currentCount: count || 0,
      });
    }

    const payload = {
      profile_id: tenant.profileId,
      provider: 'syncfy',
      provider_item_id: providerItemId,
      institution_id: cleanText(body.siteId) || extractString(body.event, ['id_site', 'idSite', 'site_id', 'siteId']),
      institution_name: bankName,
      status: 'active',
      external_user_id: null,
      last_sync_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    };

    const result = existingId
      ? await supabase
          .from('bank_connections')
          .update(payload)
          .eq('id', existingId)
          .eq('profile_id', tenant.profileId)
          .select('id, provider, provider_item_id, institution_name, status, last_sync_at')
          .single()
      : await supabase
          .from('bank_connections')
          .insert(payload)
          .select('id, provider, provider_item_id, institution_name, status, last_sync_at')
          .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: existingId ? 'bank.connection.updated' : 'bank.connection.created',
      resourceType: 'bank_connections',
      resourceId: result.data.id,
      metadata: {
        provider: 'syncfy',
        bankName,
        country,
        providerItemId,
      },
    });

    return NextResponse.json({
      success: true,
      provider: 'syncfy',
      connection: result.data,
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'bank.connection.syncfy_confirm',
      error,
      severity: error instanceof BillingLimitError ? 'warning' : 'error',
    });
    const message = error instanceof Error ? error.message : 'No pude guardar la conexion Syncfy.';
    const status = error instanceof BillingLimitError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
