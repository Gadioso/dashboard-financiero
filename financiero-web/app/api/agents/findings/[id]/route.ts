import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

const statuses = new Set(['active', 'accepted', 'dismissed', 'resolved', 'superseded']);

export async function PATCH(request: Request, context: RouteContext) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const status = body.status?.trim();

    if (!id) {
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID del hallazgo.' }, { status: 400 });
    }

    if (!status || !statuses.has(status)) {
      return NextResponse.json({ success: false, error: 'Estado de hallazgo inválido.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('agent_findings')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', profileId)
      .select('id, agent_key, finding_type, severity, title, summary, status, created_at')
      .maybeSingle();

    if (error) {
      throw new Error(`No pude actualizar hallazgo: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No encontré el hallazgo.' }, { status: 404 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'agent_finding.update',
      resourceType: 'agent_findings',
      resourceId: data.id,
      metadata: { status },
    });

    return NextResponse.json({ success: true, finding: data });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'agent_finding.update', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
