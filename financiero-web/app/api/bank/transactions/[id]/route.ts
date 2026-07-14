import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getRequestTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{ id?: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'No pude conectar con tus datos.' }, { status: 500 });
    }

    const { id } = await context.params;
    const tenant = await getRequestTenantContext(request);

    if (!id) {
      return NextResponse.json({ success: false, error: 'No se identificó el movimiento.' }, { status: 400 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const transactionQuery = supabase
      .from('bank_transactions_raw')
      .select('id, gasto_id, ingreso_id')
      .eq('id', id);
    const { data: transaction, error: findError } = await applyProfileFilter(transactionQuery, tenant.profileId).maybeSingle();

    if (findError) throw findError;
    if (!transaction) {
      return NextResponse.json({ success: false, error: 'El movimiento ya no existe.' }, { status: 404 });
    }

    if (transaction.gasto_id) {
      const { error } = await supabase.from('gastos').delete().eq('id', transaction.gasto_id).eq('profile_id', tenant.profileId);
      if (error) throw error;
    }

    if (transaction.ingreso_id) {
      const { error } = await supabase.from('ingresos').delete().eq('id', transaction.ingreso_id).eq('profile_id', tenant.profileId);
      if (error) throw error;
    }

    const { data: hiddenTransaction, error: hideError } = await supabase
      .from('bank_transactions_raw')
      .update({
        normalized_status: 'ignored',
        gasto_id: null,
        ingreso_id: null,
        classification_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', tenant.profileId)
      .select('id')
      .maybeSingle();

    if (hideError) throw hideError;
    if (!hiddenTransaction) {
      return NextResponse.json({ success: false, error: 'No pude eliminar el movimiento.' }, { status: 404 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank_transaction.delete',
      resourceType: 'bank_transactions_raw',
      resourceId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      action: 'bank_transaction.delete',
      error,
    });
    return NextResponse.json({ success: false, error: 'No pude eliminar el movimiento. Intenta nuevamente.' }, { status: 500 });
  }
}
