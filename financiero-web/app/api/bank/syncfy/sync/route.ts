import { NextResponse } from 'next/server';
import { syncSyncfyProfile } from '@/lib/open-banking/syncfy-ingest';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { initialConnection?: boolean };
    const requestInitialPull = body.initialConnection === true;

    const result = await syncSyncfyProfile({
      supabase,
      profileId: tenant.profileId,
      classify: true,
      pullBeforeRead: requestInitialPull,
    });
    const success = result.totals.failed === 0 && (result.classification?.failed || 0) === 0 && result.notifications.failed === 0;

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank.syncfy.sync',
      resourceType: 'bank_connections',
      metadata: {
        ...result.totals,
        requestInitialPull,
        classificationFrom: result.classificationFrom,
        classification: result.classification
          ? {
            processed: result.classification.processed,
            classified: result.classification.classified,
            failed: result.classification.failed,
            ignored: result.classification.ignored,
            remainingPending: result.classification.remainingPending,
          }
          : null,
        notifications: result.notifications,
      },
    });

    return NextResponse.json({
      success,
      ...result,
    }, { status: success ? 200 : 207 });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank.syncfy.sync',
      error,
      severity: 'error',
    });
    const message = error instanceof Error ? error.message : 'No pude sincronizar Syncfy.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
