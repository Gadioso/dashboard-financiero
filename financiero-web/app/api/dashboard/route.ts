import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getRequestTenantContext } from '@/lib/tenant-context';
import { isConcreteFinancialGoal } from '@/lib/personalized-goals';
import { buildGoalCfoPlan } from '@/lib/goal-cfo-plan';

export const dynamic = 'force-dynamic';

function canIgnoreOptionalTableError(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /does not exist|schema cache|Could not find/i.test(error?.message || '');
}

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
    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

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
    const fondosQuery = supabase
      .from('fondos_acumulados')
      .select('*');
    const personalizedGoalsQuery = supabase
      .from('financial_goals')
      .select('id, name, current_amount, target_amount, target_date, horizon_months, source, updated_at')
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    const personalizationQuery = supabase
      .from('financial_personalization_profiles')
      .select('monthly_goal_capacity, emergency_fund_status, investment_experience, risk_tolerance, work_model, goal_priorities');
    const [{ data: pres, error: errorPres }, { data: ingresosAnuales, error: errorIngresos }, { data: gastosAnuales, error: errorGastos }, abonosTarjetaResult, fondosResult, personalizedGoalsResult, personalizationResult] =
      await Promise.all([
        applyProfileFilter(presupuestosQuery, tenant.profileId).maybeSingle(),
        applyProfileFilter(ingresosQuery, tenant.profileId),
        applyProfileFilter(gastosQuery, tenant.profileId),
        applyProfileFilter(abonosQuery, tenant.profileId),
        applyProfileFilter(fondosQuery, tenant.profileId),
        applyProfileFilter(personalizedGoalsQuery, tenant.profileId),
        applyProfileFilter(personalizationQuery, tenant.profileId).maybeSingle(),
      ]);

    if (errorPres) throw new Error(`No pude consultar presupuestos: ${errorPres.message}`);
    if (errorIngresos) throw new Error(`No pude consultar ingresos: ${errorIngresos.message}`);
    if (errorGastos) throw new Error(`No pude consultar gastos: ${errorGastos.message}`);

    const { data: goalSettingsRow } = await supabase
      .from('advisor_disclosures')
      .select('metadata')
      .eq('profile_id', tenant.profileId)
      .eq('disclosure_type', 'personalized_advice')
      .eq('version', 'financial-goals-v1')
      .maybeSingle();
    const goalMetadata = (goalSettingsRow?.metadata as {
      goals?: Record<string, { target?: number; targetDate?: string | null }>;
      generatedGoalIds?: Array<string | number>;
    } | null) || {};
    const goalSettings = goalMetadata.goals || {};
    const personalizedGoalIds = new Set(
      (goalMetadata.generatedGoalIds?.length ? goalMetadata.generatedGoalIds : Object.keys(goalSettings))
        .map(String)
    );
    const enrichedGoals = (fondosResult.data || [])
      .filter((goal) => personalizedGoalIds.has(String(goal.id)))
      .map((goal) => ({
      ...goal,
      objetivo: goalSettings[String(goal.id)]?.target || 0,
      fecha_objetivo: goalSettings[String(goal.id)]?.targetDate || null,
      }));
    const personalizedGoals = (personalizedGoalsResult.data || [])
      .filter((goal) => isConcreteFinancialGoal(goal.name))
      .map((goal) => ({
      id: goal.id,
      cuenta: goal.name,
      nombre: goal.name,
      balance_actual: goal.current_amount,
      objetivo: goal.target_amount,
      fecha_objetivo: goal.target_date,
      updated_at: goal.updated_at,
      }));
    const cfoPlan = personalizationResult.data
      ? buildGoalCfoPlan({
          personalization: personalizationResult.data,
          goals: (personalizedGoalsResult.data || []).filter((goal) => isConcreteFinancialGoal(goal.name)),
          legacyGeneratedGoalIds: goalMetadata.generatedGoalIds,
        })
      : null;

    return NextResponse.json({
      success: true,
      mesActivo,
      presupuesto: pres || null,
      ingresosAnuales: ingresosAnuales || [],
      gastosAnuales: gastosAnuales || [],
      abonosTarjetaAnuales: abonosTarjetaResult.error ? [] : abonosTarjetaResult.data || [],
      fondosAcumulados: personalizedGoals.length > 0
        ? personalizedGoals
        : fondosResult.error && !canIgnoreOptionalTableError(fondosResult.error) ? [] : enrichedGoals,
      cfoPlan,
      schema: {
        acceptsAbonosTarjetaCredito: !abonosTarjetaResult.error,
        abonosTarjetaError: abonosTarjetaResult.error?.message || null,
        acceptsFondosAcumulados: !fondosResult.error,
        fondosAcumuladosError: fondosResult.error?.message || null,
        acceptsPersonalizedGoals: !personalizedGoalsResult.error,
        personalizedGoalsError: personalizedGoalsResult.error?.message || null,
        profileScoped: Boolean(tenant.profileId),
        tenantSource: tenant.source,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
