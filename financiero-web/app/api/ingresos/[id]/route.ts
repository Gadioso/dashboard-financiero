import { NextResponse } from 'next/server';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getRequestTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    const { id } = await context.params;
    const tenant = await getRequestTenantContext(request);

    if (!id) {
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID del ingreso.' }, { status: 400 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const deleteQuery = supabase
      .from('ingresos')
      .delete()
      .eq('id', id)
      .select('id, fecha');
    const { data, error } = await applyProfileFilter(deleteQuery, tenant.profileId).maybeSingle();

    if (error) {
      await logErrorEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'income.delete',
        error,
        code: 'income_delete_failed',
        metadata: { id },
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No se encontró el ingreso para eliminar.' }, { status: 404 });
    }

    await sincronizarPresupuestoMensual(supabase, new Date(data.fecha), tenant.profileId);
    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'income.delete',
      resourceType: 'ingresos',
      resourceId: data.id,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'income.delete',
      error,
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
