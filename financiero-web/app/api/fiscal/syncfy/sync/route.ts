import { NextResponse } from 'next/server';
import { syncSyncfyFiscalProfile } from '@/lib/fiscal-syncfy';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);

  try {
    if (!supabase) return NextResponse.json({ success: false, error: 'Servicio fiscal no configurado.' }, { status: 503 });
    if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { initialConnection?: boolean };
    const requestInitialPull = body.initialConnection === true;
    const result = await syncSyncfyFiscalProfile({ supabase, profileId: tenant.profileId, pullBeforeRead: requestInitialPull });

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'fiscal.syncfy.sync',
      resourceType: 'cfdi_documents',
      metadata: {
        transactions: result.transactions,
        attachments: result.attachments,
        saved: result.saved,
        providerDocumentsSaved: result.providerDocumentsSaved,
        pullCompleted: result.pullCompleted,
        requestInitialPull,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    await logErrorEvent({ supabase, request, profileId: tenant.profileId, actorEmail: tenant.email, action: 'fiscal.syncfy.sync', error });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No pude sincronizar el SAT.' }, { status: 500 });
  }
}
