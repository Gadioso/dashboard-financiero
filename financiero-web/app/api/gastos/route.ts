import { NextResponse } from 'next/server';
import { categoriaParaGastos, type CategoriaFinanciera } from '@/lib/financial-core';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext, withProfile } from '@/lib/tenant-context';

const categoriasGasto = new Set(['Vida', 'Placeres', 'Futuro']);

function cleanText(value: unknown, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanAmount(value: unknown) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function cleanDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const concepto = cleanText(body.concepto);
    const monto = cleanAmount(body.monto);
    const categoria = cleanText(body.categoria, 40);
    const subcategoria = cleanText(body.subcategoria, 80) || 'Otros Placeres';
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

    const { data, error } = await supabase
      .from('gastos')
      .insert([
        withProfile({
          concepto,
          monto,
          categoria: categoriaParaGastos(categoria as CategoriaFinanciera),
          subcategoria,
          origen: 'Web',
          fecha,
        }, tenant.profileId),
      ])
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
      .single();

    if (error) {
      await logErrorEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'expense.create_manual',
        error,
        code: 'expense_create_manual_failed',
        metadata: { categoria, subcategoria, monto, fecha },
      });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'expense.create_manual',
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
      action: 'expense.create_manual',
      error,
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
