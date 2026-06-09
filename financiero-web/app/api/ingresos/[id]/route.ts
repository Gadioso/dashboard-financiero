import { NextResponse } from 'next/server';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getPrivateTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    const { id } = await context.params;
    const tenant = getPrivateTenantContext();

    if (!id) {
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID del ingreso.' }, { status: 400 });
    }

    const deleteQuery = supabase
      .from('ingresos')
      .delete()
      .eq('id', id)
      .select('id, fecha');
    const { data, error } = await applyProfileFilter(deleteQuery, tenant.profileId).maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No se encontró el ingreso para eliminar.' }, { status: 404 });
    }

    await sincronizarPresupuestoMensual(supabase, new Date(data.fecha), tenant.profileId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error eliminando ingreso:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
