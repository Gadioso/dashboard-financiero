import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

const statuses = new Set(['open', 'in_progress', 'waiting_user', 'completed', 'dismissed', 'failed']);

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
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID de la tarea.' }, { status: 400 });
    }

    if (!status || !statuses.has(status)) {
      return NextResponse.json({ success: false, error: 'Estado de tarea inválido.' }, { status: 400 });
    }

    const payload = {
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('agent_tasks')
      .update(payload)
      .eq('id', id)
      .eq('profile_id', profileId)
      .select('id, agent_key, title, status, priority, due_at, created_at')
      .maybeSingle();

    if (error) {
      throw new Error(`No pude actualizar tarea: ${error.message}`);
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No encontré la tarea.' }, { status: 404 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'agent_task.update',
      resourceType: 'agent_tasks',
      resourceId: data.id,
      metadata: { status },
    });

    return NextResponse.json({ success: true, task: data });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'agent_task.update', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
