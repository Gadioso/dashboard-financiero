import { NextResponse } from 'next/server';
import { categoriaParaGastos, type CategoriaFinanciera } from '@/lib/financial-core';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getRequestTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

const categoriasGasto = new Set(['Vida', 'Placeres', 'Futuro']);

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
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID del gasto.' }, { status: 400 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const concepto = cleanText(body.concepto);
    const monto = cleanAmount(body.monto);
    const categoria = cleanText(body.categoria, 40);
    const subcategoria = cleanText(body.subcategoria, 80) || null;
    const fecha = cleanDate(body.fecha);

    if (!concepto) {
      return NextResponse.json({ success: false, error: 'El concepto es obligatorio.' }, { status: 400 });
    }

    if (monto === null) {
      return NextResponse.json({ success: false, error: 'El monto debe ser mayor a cero.' }, { status: 400 });
    }

    if (!categoriasGasto.has(categoria)) {
      return NextResponse.json({ success: false, error: 'La categoría debe ser Vida, Placeres o Futuro.' }, { status: 400 });
    }

    if (!fecha) {
      return NextResponse.json({ success: false, error: 'La fecha no es válida.' }, { status: 400 });
    }

    const updateQuery = supabase
      .from('gastos')
      .update({ concepto, monto, categoria: categoriaParaGastos(categoria as CategoriaFinanciera), subcategoria, fecha })
      .eq('id', id)
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha');
    const { data, error } = await applyProfileFilter(updateQuery, tenant.profileId).maybeSingle();

    if (error) {
      await logErrorEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'expense.update',
        error,
        code: 'expense_update_failed',
        metadata: { id },
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No se encontró el gasto para editar.' }, { status: 404 });
    }

    const matcher = concepto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (matcher.length >= 2) {
      const { error: preferenceError } = await supabase
        .from('classification_preferences')
        .upsert({
          profile_id: tenant.profileId,
          matcher,
          categoria,
          subcategoria: subcategoria || categoria,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id,matcher' });

      if (preferenceError) {
        console.error('No pude guardar la preferencia de clasificación:', preferenceError.message);
      }
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'expense.update',
      resourceType: 'gastos',
      resourceId: data.id,
      metadata: { categoria, subcategoria, monto, fecha },
    });

    return NextResponse.json({ success: true, gasto: data });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'expense.update',
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
      return NextResponse.json({ success: false, error: 'No proporcionaste el ID del gasto.' }, { status: 400 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const deleteQuery = supabase
      .from('gastos')
      .delete()
      .eq('id', id)
      .select('id, bank_transaction_raw_id');
    const { data, error } = await applyProfileFilter(deleteQuery, tenant.profileId).maybeSingle();

    if (error) {
      await logErrorEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'expense.delete',
        error,
        code: 'expense_delete_failed',
        metadata: { id },
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No se encontró el gasto para eliminar.' }, { status: 404 });
    }

    if (data.bank_transaction_raw_id) {
      const { error: bankTransactionError } = await supabase
        .from('bank_transactions_raw')
        .update({
          normalized_status: 'ignored',
          gasto_id: null,
          classification_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.bank_transaction_raw_id)
        .eq('profile_id', tenant.profileId);

      if (bankTransactionError) {
        return NextResponse.json({ success: false, error: 'El gasto se eliminó, pero no pude evitar que el banco lo importe nuevamente.' }, { status: 500 });
      }
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'expense.delete',
      resourceType: 'gastos',
      resourceId: data.id,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'expense.delete',
      error,
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
