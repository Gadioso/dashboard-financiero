import { NextResponse } from 'next/server';
import { syncSyncfyFiscalProfile } from '@/lib/fiscal-syncfy';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  const authorization = request.headers.get('authorization') || '';
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();

  try {
    if (!supabase) return NextResponse.json({ success: false, error: 'Servicio fiscal no configurado.' }, { status: 503 });
    if (!isAuthorized(request)) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    if (process.env.SYNCFY_AUTOMATIC_PULLS_ENABLED !== 'true') {
      return NextResponse.json({
        success: true,
        disabled: true,
        mode: 'webhook-first',
        message: 'Los pulls automáticos están desactivados; Syncfy actualizará mediante webhook.',
      });
    }

    const integrations = await supabase
      .from('fiscal_integrations')
      .select('profile_id')
      .eq('provider', 'syncfy')
      .eq('integration_type', 'open_fiscal')
      .eq('status', 'active');
    if (integrations.error) throw new Error(integrations.error.message);

    const profileIds = [...new Set((integrations.data || []).map((row) => row.profile_id as string))];
    const results = [];
    for (const profileId of profileIds) {
      try {
        const result = await syncSyncfyFiscalProfile({ supabase, profileId, pullBeforeRead: true });
        results.push({ profileId, success: true, ...result });
      } catch (error: unknown) {
        await logErrorEvent({ supabase, request, profileId, action: 'fiscal.syncfy.auto_sync.profile', error });
        results.push({ profileId, success: false, error: error instanceof Error ? error.message : 'No pude sincronizar el SAT.' });
      }
    }

    const failed = results.filter((result) => !result.success).length;
    const saved = results.reduce((sum, result) => sum + ('saved' in result ? Number(result.saved || 0) : 0), 0);
    const providerDocumentsSaved = results.reduce((sum, result) => sum + ('providerDocumentsSaved' in result ? Number(result.providerDocumentsSaved || 0) : 0), 0);
    await logAuditEvent({
      supabase,
      request,
      action: 'fiscal.syncfy.auto_sync',
      resourceType: 'fiscal_integrations',
      metadata: { profiles: profileIds.length, failed, saved, providerDocumentsSaved },
    });

    return NextResponse.json({ success: failed === 0, totals: { profiles: profileIds.length, failed, saved, providerDocumentsSaved }, results }, { status: failed ? 207 : 200 });
  } catch (error: unknown) {
    await logErrorEvent({ supabase, request, action: 'fiscal.syncfy.auto_sync', error });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No pude ejecutar la sincronización fiscal.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
