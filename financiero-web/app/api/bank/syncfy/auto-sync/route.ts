import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { syncSyncfyProfile } from '@/lib/open-banking/syncfy-ingest';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SyncfyUserProfileRow = {
  profile_id: string;
  syncfy_user_id: string;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

async function isCronRequest(
  request: Request,
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>
) {
  const cronSecret = process.env.CRON_SECRET || '';
  const bearerToken = getBearerToken(request);
  if (cronSecret && bearerToken === cronSecret) return true;

  const timestamp = request.headers.get('x-bank-sync-timestamp') || '';
  const receivedSignature = request.headers.get('x-bank-sync-signature') || '';
  const timestampNumber = Number(timestamp);
  if (!timestamp || !receivedSignature || !Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() - timestampNumber) > 5 * 60 * 1000) return false;

  const secretResult = await supabase.rpc('get_bank_sync_scheduler_secret');
  const schedulerSecret = typeof secretResult.data === 'string' ? secretResult.data.trim() : '';
  if (secretResult.error || !schedulerSecret) return false;
  const expectedSignature = createHmac('sha256', schedulerSecret).update(timestamp).digest('hex');
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function listSyncfyProfiles(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>) {
  const { data, error } = await supabase
    .from('syncfy_users')
    .select('profile_id, syncfy_user_id')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`No pude leer usuarios Syncfy: ${error.message}`);

  return (data || []) as SyncfyUserProfileRow[];
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    if (!await isCronRequest(request, supabase)) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    if (process.env.SYNCFY_AUTOMATIC_PULLS_ENABLED !== 'true') {
      return NextResponse.json({
        success: true,
        disabled: true,
        mode: 'webhook-first',
        message: 'Los pulls automáticos están desactivados; Syncfy actualizará mediante webhook.',
      });
    }

    const profiles = await listSyncfyProfiles(supabase);
    const results = [];

    for (const profile of profiles) {
      try {
        const result = await syncSyncfyProfile({
          supabase,
          profileId: profile.profile_id,
          syncfyUserId: profile.syncfy_user_id,
          classify: true,
          pullBeforeRead: true,
        });

        results.push({
          profileId: profile.profile_id,
          success: result.totals.failed === 0 && (result.classification?.failed || 0) === 0 && result.notifications.failed === 0,
          ...result,
        });
      } catch (profileError: unknown) {
        await logErrorEvent({
          supabase,
          request,
          profileId: profile.profile_id,
          action: 'bank.syncfy.auto_sync.profile',
          error: profileError,
          severity: 'error',
        });

        results.push({
          profileId: profile.profile_id,
          success: false,
          error: profileError instanceof Error ? profileError.message : 'No pude sincronizar Syncfy.',
        });
      }
    }

    const totals = results.reduce(
      (acc, result) => ({
        profiles: acc.profiles + 1,
        failedProfiles: acc.failedProfiles + (result.success ? 0 : 1),
        insertedOrUpdated: acc.insertedOrUpdated + ('totals' in result ? result.totals.insertedOrUpdated : 0),
        classified: acc.classified + ('classification' in result && result.classification ? result.classification.classified : 0),
        classificationFailed: acc.classificationFailed + ('classification' in result && result.classification ? result.classification.failed : 0),
        telegramSent: acc.telegramSent + ('notifications' in result && result.notifications ? result.notifications.sent : 0),
        telegramFailed: acc.telegramFailed + ('notifications' in result && result.notifications ? result.notifications.failed : 0),
      }),
      { profiles: 0, failedProfiles: 0, insertedOrUpdated: 0, classified: 0, classificationFailed: 0, telegramSent: 0, telegramFailed: 0 }
    );

    await logAuditEvent({
      supabase,
      request,
      action: 'bank.syncfy.auto_sync',
      resourceType: 'bank_connections',
      metadata: totals,
    });

    return NextResponse.json({
      success: totals.failedProfiles === 0,
      totals,
      results,
    }, { status: totals.failedProfiles ? 207 : 200 });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      action: 'bank.syncfy.auto_sync',
      error,
      severity: 'error',
    });
    const message = error instanceof Error ? error.message : 'No pude ejecutar la sincronizacion automatica Syncfy.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
