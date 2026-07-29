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

function cleanText(value: unknown, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanAmount(value: unknown) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function cleanDate(value: unknown) {
  const date = new Date(String(value || ''));

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function PATCH(request: Request, context: RouteContext) {
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

    const body = await request.json().catch(() => ({}));
    const concepto = cleanText(body.concepto) || 'Ingreso';
    const monto = cleanAmount(body.monto);
    const tipo = cleanText(body.tipo, 80) || 'Extra';
    const fecha = cleanDate(body.fecha);

    if (monto === null) {
      return NextResponse.json({ success: false, error: 'El monto debe ser mayor a cero.' }, { status: 400 });
    }

    if (!fecha) {
      return NextResponse.json({ success: false, error: 'La fecha no es válida.' }, { status: 400 });
    }

    const updateQuery = supabase
      .from('ingresos')
      .update({ concepto, monto, tipo, fecha })
      .eq('id', id)
      .select('id, concepto, monto, tipo, fecha');
    const { data, error } = await applyProfileFilter(updateQuery, tenant.profileId).maybeSingle();

    if (error) {
      await logErrorEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'income.update',
        error,
        code: 'income_update_failed',
        metadata: { id },
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No se encontró el ingreso para editar.' }, { status: 404 });
    }

    await sincronizarPresupuestoMensual(supabase, new Date(fecha), tenant.profileId);
    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'income.update',
      resourceType: 'ingresos',
      resourceId: data.id,
      metadata: { tipo, monto, fecha },
    });

    return NextResponse.json({ success: true, ingreso: data });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'income.update',
      error,
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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
