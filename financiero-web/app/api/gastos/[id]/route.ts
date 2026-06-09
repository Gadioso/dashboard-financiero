import { NextResponse } from 'next/server';
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
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID del gasto.' }, { status: 400 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const deleteQuery = supabase
      .from('gastos')
      .delete()
      .eq('id', id)
      .select('id');
    const { data, error } = await applyProfileFilter(deleteQuery, tenant.profileId).maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No se encontró el gasto para eliminar.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error eliminando gasto:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
