import { NextResponse } from 'next/server';
import { clasificarMovimientoFinanciero } from '@/lib/ai-classifier';
import { categoriaParaGastos, extraerFechaMovimiento } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext, withProfile } from '@/lib/tenant-context';

const aiApiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    }

    const { texto } = await request.json();
    const tenant = await getRequestTenantContext(request);

    if (!texto) {
      return NextResponse.json({ success: false, error: 'No proporcionaste ningún texto.' }, { status: 400 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const dataAI = await clasificarMovimientoFinanciero(texto, aiApiKey, { supabase, profileId: tenant.profileId });
    const fechaMovimiento = dataAI.fechaMovimiento && !Number.isNaN(new Date(dataAI.fechaMovimiento).getTime())
      ? new Date(dataAI.fechaMovimiento)
      : extraerFechaMovimiento(texto) || new Date();

    // 4. Inserción directa en la base de datos de Supabase según el tipo mapeado
    let queryResult;

    if (dataAI.tipo === 'gasto') {
      // Ajustamos el nombre de la categoría para que haga match con tu base de datos
      const categoriaFinal = categoriaParaGastos(dataAI.categoria);

      queryResult = await supabase
        .from('gastos')
        .insert([withProfile({
          concepto: dataAI.concepto,
          monto: Number(dataAI.monto),
          categoria: categoriaFinal,
          subcategoria: dataAI.subcategoria,
          origen: 'Web',
          fecha: fechaMovimiento.toISOString()
        }, tenant.profileId)])
        .select();
    } else {
      queryResult = await supabase
        .from('ingresos')
        .insert([withProfile({
          concepto: dataAI.concepto,
          monto: Number(dataAI.monto),
          tipo: 'Extra',
          fecha: fechaMovimiento.toISOString()
        }, tenant.profileId)])
        .select();

      if (!queryResult.error) {
        await sincronizarPresupuestoMensual(supabase, fechaMovimiento, tenant.profileId);
      }
    }

    if (queryResult.error) {
      await logErrorEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'movement.create_ai',
        error: queryResult.error,
        code: 'movement_insert_failed',
        metadata: { tipo: dataAI.tipo },
      });
      return NextResponse.json({ success: false, error: queryResult.error.message }, { status: 500 });
    }

    const inserted = Array.isArray(queryResult.data) ? queryResult.data[0] as { id?: string | number } | undefined : null;
    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'movement.create_ai',
      resourceType: dataAI.tipo === 'gasto' ? 'gastos' : 'ingresos',
      resourceId: inserted?.id || null,
      metadata: {
        tipo: dataAI.tipo,
        categoria: dataAI.categoria,
        subcategoria: dataAI.subcategoria,
        amount: Number(dataAI.monto),
        fecha: fechaMovimiento.toISOString(),
      },
    });

    return NextResponse.json({ success: true, data: dataAI });

  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'movement.create_ai',
      error,
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
