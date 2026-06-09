import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getPrivateTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function validarMes(mes: string | null) {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) return mes;

  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY para leer el dashboard desde servidor.' },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const mesActivo = validarMes(url.searchParams.get('mes'));
    const tenant = getPrivateTenantContext();
    const inicio2026 = new Date(Date.UTC(2026, 0, 1)).toISOString();
    const fin2026 = new Date(Date.UTC(2027, 0, 1)).toISOString();
    const presupuestosQuery = supabase
      .from('presupuestos_mensuales')
      .select('techo_vida, techo_placeres, techo_futuro, fase_ahorro')
      .eq('mes_anio', `${mesActivo}-01`);
    const ingresosQuery = supabase
      .from('ingresos')
      .select('id, concepto, monto, tipo, fecha')
      .gte('fecha', inicio2026)
      .lt('fecha', fin2026);
    const gastosQuery = supabase
      .from('gastos')
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
      .gte('fecha', inicio2026)
      .lt('fecha', fin2026);
    const abonosQuery = supabase
      .from('abonos_tarjeta_credito')
      .select('id, concepto, monto, tarjeta, origen, fecha')
      .gte('fecha', inicio2026)
      .lt('fecha', fin2026)
      .order('fecha', { ascending: false });

    const [{ data: pres, error: errorPres }, { data: ingresosAnuales, error: errorIngresos }, { data: gastosAnuales, error: errorGastos }, abonosTarjetaResult] =
      await Promise.all([
        applyProfileFilter(presupuestosQuery, tenant.profileId).maybeSingle(),
        applyProfileFilter(ingresosQuery, tenant.profileId),
        applyProfileFilter(gastosQuery, tenant.profileId),
        applyProfileFilter(abonosQuery, tenant.profileId),
      ]);

    if (errorPres) throw new Error(`No pude consultar presupuestos: ${errorPres.message}`);
    if (errorIngresos) throw new Error(`No pude consultar ingresos: ${errorIngresos.message}`);
    if (errorGastos) throw new Error(`No pude consultar gastos: ${errorGastos.message}`);

    return NextResponse.json({
      success: true,
      mesActivo,
      presupuesto: pres || null,
      ingresosAnuales: ingresosAnuales || [],
      gastosAnuales: gastosAnuales || [],
      abonosTarjetaAnuales: abonosTarjetaResult.error ? [] : abonosTarjetaResult.data || [],
      schema: {
        acceptsAbonosTarjetaCredito: !abonosTarjetaResult.error,
        abonosTarjetaError: abonosTarjetaResult.error?.message || null,
        profileScoped: Boolean(tenant.profileId),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
