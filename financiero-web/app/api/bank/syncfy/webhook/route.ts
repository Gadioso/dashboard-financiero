import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { syncfyFiscalOrganizationType, syncfySatAllInOneSiteId, syncSyncfyFiscalProfile } from '@/lib/fiscal-syncfy';
import { syncSyncfyProfile } from '@/lib/open-banking/syncfy-ingest';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SyncfyWebhookPayload = {
  event?: string;
  id_credential?: string;
  id_user?: string;
  id_external?: string;
  id_site?: string;
  id_site_organization?: string;
  id_site_organization_type?: string;
  id_job?: string;
  id_job_uuid?: string;
  endpoints?: Record<string, unknown>;
};

type SyncfyV3WebhookPayload = {
  events?: Array<{
    header?: {
      event?: { name?: string };
      user?: { id_user?: string; id_external?: string };
    };
    payload?: SyncfyWebhookPayload;
  }>;
};

const syncfyFiscalSiteIds = new Set([
  syncfySatAllInOneSiteId,
  '56cf5728784806f72b8b456f',
  '58543125784806c3298b4572',
  '59aefe28056f29793a58c091',
  '59aefe28056f29793a58c092',
  '5f6bbaa541273336c87d96c1',
]);

const dataReadyEvents = new Set([
  'refresh',
  'credentials.refresh',
  'credentials.refreshed',
  'documents.success',
  'documents.completed',
]);

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: Request) {
  const expected = process.env.SYNCFY_WEBHOOK_SECRET || '';
  const received = request.headers.get('x-syncfy-webhook-secret') || bearerToken(request);

  return Boolean(expected && received && secureEqual(expected, received));
}

function normalizeWebhookPayloads(raw: unknown): SyncfyWebhookPayload[] {
  if (!raw || typeof raw !== 'object') return [];
  const v3Events = (raw as SyncfyV3WebhookPayload).events;
  if (!Array.isArray(v3Events)) return [raw as SyncfyWebhookPayload];

  return v3Events
    .map((entry) => ({
      ...(entry.payload || {}),
      event: cleanText(entry.payload?.event) || cleanText(entry.header?.event?.name) || undefined,
      id_user: cleanText(entry.payload?.id_user) || cleanText(entry.header?.user?.id_user) || undefined,
      id_external: cleanText(entry.payload?.id_external) || cleanText(entry.header?.user?.id_external) || undefined,
    }))
    .filter((entry) => Boolean(entry.event || entry.id_user || entry.id_external));
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = getSupabaseServiceClient();
  let profileId: string | null = null;

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const rawPayload = await request.json();
    const payloads = normalizeWebhookPayloads(rawPayload);
    if (!payloads.length) {
      return NextResponse.json({ success: false, error: 'Webhook Syncfy vacío o inválido.' }, { status: 400 });
    }

    if (payloads.length > 1) {
      const results = [];
      for (const payload of payloads) {
        const childRequest = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(payload),
        });
        const response = await POST(childRequest);
        results.push({ status: response.status, body: await response.json() });
      }
      const failed = results.filter((result) => result.status >= 400).length;
      return NextResponse.json({ success: failed === 0, batched: true, processed: results.length, failed, results }, { status: failed ? 207 : 200 });
    }

    const payload = payloads[0];
    const syncfyUserId = cleanText(payload.id_user);
    const externalId = cleanText(payload.id_external);
    const credentialId = cleanText(payload.id_credential);
    const event = cleanText(payload.event) || 'refresh';

    if (!syncfyUserId && !externalId) {
      return NextResponse.json({ success: false, error: 'Webhook sin id_user o id_external.' }, { status: 400 });
    }

    let userQuery = supabase
      .from('syncfy_users')
      .select('profile_id, syncfy_user_id');

    userQuery = syncfyUserId
      ? userQuery.eq('syncfy_user_id', syncfyUserId)
      : userQuery.eq('id_external', externalId as string);

    const userResult = await userQuery.maybeSingle();

    if (userResult.error) throw new Error(userResult.error.message);
    if (!userResult.data?.profile_id) {
      return NextResponse.json({ success: false, error: 'Usuario Syncfy no reconocido.' }, { status: 404 });
    }

    const resolvedProfileId = userResult.data.profile_id as string;
    profileId = resolvedProfileId;
    const siteId = cleanText(payload.id_site);
    const organizationType = cleanText(payload.id_site_organization_type);
    const isFiscalWebhook = organizationType === syncfyFiscalOrganizationType
      || Boolean(siteId && syncfyFiscalSiteIds.has(siteId));

    // Syncfy emits several lifecycle events. Only a refresh event means that
    // provider data is ready to read; acknowledging the others prevents an
    // unnecessary API read and, more importantly, never requests a paid pull.
    if (!dataReadyEvents.has(event.toLowerCase())) {
      await logAuditEvent({
        supabase,
        request,
        profileId: resolvedProfileId,
        action: 'syncfy.webhook.acknowledged',
        resourceType: isFiscalWebhook ? 'fiscal_integrations' : 'bank_connections',
        metadata: {
          event,
          credentialId,
          siteId,
          jobId: cleanText(payload.id_job_uuid) || cleanText(payload.id_job),
          reason: 'event_without_refreshed_data',
        },
      });

      return NextResponse.json({ success: true, acknowledged: true, processed: false, event });
    }

    if (isFiscalWebhook) {
      const fiscalProfile = await supabase
        .from('fiscal_profiles')
        .select('id')
        .eq('profile_id', resolvedProfileId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (fiscalProfile.error) throw new Error(fiscalProfile.error.message);
      if (!fiscalProfile.data) return NextResponse.json({ success: false, error: 'Expediente fiscal no configurado.' }, { status: 409 });

      if (credentialId) {
        const now = new Date().toISOString();
        const integration = await supabase
          .from('fiscal_integrations')
          .upsert({
            profile_id: resolvedProfileId,
            fiscal_profile_id: fiscalProfile.data.id,
            integration_type: 'open_fiscal',
            provider: 'syncfy',
            status: 'active',
            provider_connection_id: credentialId,
            last_error: null,
            metadata: { product: 'sat_all_in_one', siteId: siteId || syncfySatAllInOneSiteId, credentialsStoredBy: 'syncfy' },
            updated_at: now,
          }, { onConflict: 'profile_id,integration_type,provider' });
        if (integration.error) throw new Error(integration.error.message);
      }

      const fiscalResult = await syncSyncfyFiscalProfile({
        supabase,
        profileId: resolvedProfileId,
        credentialId,
        pullBeforeRead: false,
      });
      await logAuditEvent({
        supabase,
        request,
        profileId: resolvedProfileId,
        action: 'fiscal.syncfy.webhook',
        resourceType: 'cfdi_documents',
        metadata: {
          event,
          credentialId,
          siteId,
          jobId: cleanText(payload.id_job_uuid) || cleanText(payload.id_job),
          transactions: fiscalResult.transactions,
          saved: fiscalResult.saved,
        },
      });

      return NextResponse.json({ success: true, event, fiscal: true, ...fiscalResult });
    }

    if (credentialId) {
      const connections = await supabase
        .from('bank_connections')
        .select('id, provider_item_id')
        .eq('profile_id', resolvedProfileId)
        .eq('provider', 'syncfy')
        .eq('status', 'active')
        .order('updated_at', { ascending: false });

      if (connections.error) throw new Error(connections.error.message);

      const alreadyLinked = (connections.data || []).some((connection) => connection.provider_item_id === credentialId);
      const fallbackConnection = (connections.data || []).find((connection) => !connection.provider_item_id || connection.provider_item_id.includes(':'));

      if (!alreadyLinked && fallbackConnection) {
        const linked = await supabase
          .from('bank_connections')
          .update({
            provider_item_id: credentialId,
            institution_id: siteId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', fallbackConnection.id)
          .eq('profile_id', resolvedProfileId);

        if (linked.error) throw new Error(linked.error.message);
      }
    }

    const result = await syncSyncfyProfile({
      supabase,
      profileId: resolvedProfileId,
      syncfyUserId: userResult.data.syncfy_user_id,
      classify: true,
      pullBeforeRead: false,
    });

    await logAuditEvent({
      supabase,
      request,
      profileId: resolvedProfileId,
      action: 'bank.syncfy.webhook',
      resourceType: 'bank_transactions_raw',
      metadata: {
        event,
        credentialId,
        siteId,
        jobId: cleanText(payload.id_job_uuid) || cleanText(payload.id_job),
        totals: result.totals,
        notifications: result.notifications,
      },
    });

    return NextResponse.json({
      success: result.totals.failed === 0 && result.notifications.failed === 0,
      event,
      totals: result.totals,
      classification: result.classification,
      notifications: result.notifications,
    }, { status: result.totals.failed || result.notifications.failed ? 207 : 200 });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      profileId,
      action: 'bank.syncfy.webhook',
      error,
      severity: 'error',
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'No pude procesar el webhook Syncfy.',
    }, { status: 500 });
  }
}
