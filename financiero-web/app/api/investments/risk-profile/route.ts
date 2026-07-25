import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { buildWealthRoute, type WealthRouteInput } from '@/lib/wealth-route';
import { isConcreteFinancialGoal } from '@/lib/personalized-goals';

export const dynamic = 'force-dynamic';

const disclosureVersion = '2026-06-30-v1';
const allowedAssetTypes = new Set(['cash', 'bond', 'fund', 'etf', 'stock', 'crypto', 'prediction_market']);

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(String(value || '').replace(/[,%\s]/g, ''));

  if (!Number.isFinite(numeric)) return fallback;

  return Math.min(Math.max(numeric, min), max);
}

function cleanAssetTypes(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const cleaned = values
    .map((item) => typeof item === 'string' ? item.trim().toLowerCase() : '')
    .filter((item) => allowedAssetTypes.has(item));

  return [...new Set(cleaned)];
}

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

type PersonalizationRow = {
  interview_completed_at?: string | null;
  monthly_goal_capacity?: number | string | null;
  investment_experience?: string | null;
  risk_tolerance?: string | null;
  emergency_fund_status?: string | null;
};

type GoalRow = {
  id: string;
  name: string;
  current_amount?: number | string | null;
  target_amount?: number | string | null;
  target_date?: string | null;
  horizon_months?: number | string | null;
  source?: string | null;
};

function eligibleGoals(goals: GoalRow[]) {
  return goals.filter((goal) => goal.source !== 'personalization' || isConcreteFinancialGoal(goal.name));
}

function deriveExperience(value: unknown): WealthRouteInput['experienceLevel'] {
  const text = String(value || '').toLocaleLowerCase('es-MX');
  if (/avanz|exper|experto/.test(text)) return 'experienced';
  if (/ninguna|princip|empez/.test(text)) return 'beginner';
  return 'intermediate';
}

function deriveRisk(value: unknown): WealthRouteInput['riskTolerance'] {
  const text = String(value || '').toLocaleLowerCase('es-MX');
  if (/conserv|baja/.test(text)) return 'conservative';
  if (/agres|alta/.test(text)) return 'aggressive';
  return 'balanced';
}

function deriveEmergencyMonths(value: unknown) {
  const match = String(value || '').match(/\d+(?:[.,]\d+)?/);
  return match ? Math.min(Math.max(Number(match[0].replace(',', '.')), 0), 36) : 3;
}

function deriveHorizon(goals: GoalRow[]): WealthRouteInput['horizon'] {
  const primaryMonths = Number(goals[0]?.horizon_months || 36);
  if (primaryMonths <= 18) return 'short';
  if (primaryMonths >= 60) return 'long';
  return 'medium';
}

function mapGoals(goals: GoalRow[]) {
  return goals.map((goal) => ({
    id: String(goal.id),
    name: String(goal.name || '').trim(),
    currentAmount: Math.max(0, Number(goal.current_amount || 0)),
    targetAmount: Math.max(0, Number(goal.target_amount || 0)),
    targetDate: goal.target_date || null,
    horizonMonths: Math.max(1, Number(goal.horizon_months || 12)),
  }));
}

function buildInput(personalization: PersonalizationRow, goals: GoalRow[], monthlyIncomeTarget: unknown, contribution?: number): WealthRouteInput {
  return {
    experienceLevel: deriveExperience(personalization.investment_experience),
    monthlyContribution: contribution ?? Math.max(0, Number(personalization.monthly_goal_capacity || 0)),
    riskTolerance: deriveRisk(personalization.risk_tolerance),
    horizon: deriveHorizon(goals),
    emergencyFundMonths: deriveEmergencyMonths(personalization.emergency_fund_status),
    allowCrypto: false,
    allowPredictionMarkets: false,
    noLeverage: true,
    monthlyIncomeTarget: Math.max(0, Number(monthlyIncomeTarget || 0)),
    goals: mapGoals(goals),
  };
}

function eligibility(personalization: PersonalizationRow | null, goals: GoalRow[]) {
  const profileCompleted = Boolean(personalization?.interview_completed_at);
  const hasGoals = eligibleGoals(goals).some((goal) => Number(goal.target_amount || 0) > 0);
  return {
    ready: profileCompleted && hasGoals,
    profileCompleted,
    hasGoals,
    reason: !profileCompleted
      ? 'Completa primero tu entrevista de metas.'
      : !hasGoals
        ? 'Define el monto de al menos una meta financiera para construir tu ruta.'
        : null,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const [
      { data: disclosure, error: disclosureError },
      { data: limits, error: limitsError },
      { data: personalization, error: personalizationError },
      { data: goals, error: goalsError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase
        .from('advisor_disclosures')
        .select('id, disclosure_type, version, accepted_at, metadata')
        .eq('profile_id', tenant.profileId)
        .eq('disclosure_type', 'risk_profile')
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('risk_limits')
        .select('id, scope, scope_value, limit_type, limit_value, currency, status, metadata, created_at, updated_at')
        .eq('profile_id', tenant.profileId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('financial_personalization_profiles')
        .select('interview_completed_at, monthly_goal_capacity, investment_experience, risk_tolerance, emergency_fund_status')
        .eq('profile_id', tenant.profileId)
        .maybeSingle(),
      supabase
        .from('financial_goals')
        .select('id, name, current_amount, target_amount, target_date, horizon_months, source')
        .eq('profile_id', tenant.profileId)
        .eq('status', 'active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('monthly_income_target')
        .eq('id', tenant.profileId)
        .maybeSingle(),
    ]);

    if ([disclosureError, limitsError, personalizationError, goalsError].some(tableMissing)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630000100_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (disclosureError) {
      throw new Error(`No pude leer el perfil de riesgo: ${disclosureError.message}`);
    }

    if (limitsError) {
      throw new Error(`No pude leer límites de riesgo: ${limitsError.message}`);
    }

    if (personalizationError) throw new Error(`No pude leer tus metas: ${personalizationError.message}`);
    if (goalsError) throw new Error(`No pude leer tus objetivos: ${goalsError.message}`);
    if (profileError) throw new Error(`No pude leer tu perfil: ${profileError.message}`);

    const goalRows = eligibleGoals((goals || []) as GoalRow[]);
    const personalizationRow = (personalization || null) as PersonalizationRow | null;
    const wealthEligibility = eligibility(personalizationRow, goalRows);
    const riskProfile = personalizationRow
      ? buildInput(personalizationRow, goalRows, profile?.monthly_income_target)
      : null;

    return NextResponse.json({
      success: true,
      riskProfile,
      routePlan: riskProfile && wealthEligibility.ready ? buildWealthRoute(riskProfile) : null,
      acceptedAt: disclosure?.accepted_at || null,
      limits: limits || [],
      goals: mapGoals(goalRows),
      eligibility: wealthEligibility,
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, action: 'investments.risk_profile.read', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const [personalizationResult, goalsResult, profileResult] = await Promise.all([
      supabase
        .from('financial_personalization_profiles')
        .select('interview_completed_at, monthly_goal_capacity, investment_experience, risk_tolerance, emergency_fund_status')
        .eq('profile_id', profileId)
        .maybeSingle(),
      supabase
        .from('financial_goals')
        .select('id, name, current_amount, target_amount, target_date, horizon_months, source')
        .eq('profile_id', profileId)
        .eq('status', 'active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('monthly_income_target')
        .eq('id', profileId)
        .maybeSingle(),
    ]);
    if (personalizationResult.error) throw new Error(`No pude leer tus metas: ${personalizationResult.error.message}`);
    if (goalsResult.error) throw new Error(`No pude leer tus objetivos: ${goalsResult.error.message}`);
    if (profileResult.error) throw new Error(`No pude leer tu perfil: ${profileResult.error.message}`);

    const personalization = (personalizationResult.data || null) as PersonalizationRow | null;
    const goals = eligibleGoals((goalsResult.data || []) as GoalRow[]);
    const wealthEligibility = eligibility(personalization, goals);
    if (!personalization || !wealthEligibility.ready) {
      return NextResponse.json({ success: false, error: wealthEligibility.reason, eligibility: wealthEligibility }, { status: 409 });
    }

    const monthlyContribution = cleanNumber(body.monthlyContribution, Number(personalization.monthly_goal_capacity || 0), 0, 100_000_000);
    if (monthlyContribution <= 0) {
      return NextResponse.json({ success: false, error: 'Define cuánto puedes aportar al mes para tus metas.' }, { status: 400 });
    }
    const { error: capacityError } = await supabase
      .from('financial_personalization_profiles')
      .update({ monthly_goal_capacity: monthlyContribution, updated_at: new Date().toISOString() })
      .eq('profile_id', profileId);
    if (capacityError) throw new Error(`No pude actualizar tu capacidad mensual: ${capacityError.message}`);

    const routeInput = buildInput({ ...personalization, monthly_goal_capacity: monthlyContribution }, goals, profileResult.data?.monthly_income_target, monthlyContribution);
    const { riskTolerance, horizon, experienceLevel, emergencyFundMonths, allowCrypto, allowPredictionMarkets, noLeverage } = routeInput;
    const maxDrawdownPct = cleanNumber(body.maxDrawdownPct, riskTolerance === 'conservative' ? 10 : riskTolerance === 'aggressive' ? 35 : 20, 1, 80);
    const maxPositionPct = cleanNumber(body.maxPositionPct, riskTolerance === 'conservative' ? 10 : riskTolerance === 'aggressive' ? 25 : 15, 1, 80);
    const allowedAssets = cleanAssetTypes(body.allowedAssetTypes);
    const effectiveAllowedAssets = allowedAssets.length > 0
      ? allowedAssets
      : [
          'cash',
          'bond',
          'fund',
          'etf',
          ...(riskTolerance !== 'conservative' ? ['stock'] : []),
          ...(allowCrypto ? ['crypto'] : []),
          ...(allowPredictionMarkets ? ['prediction_market'] : []),
        ];

    const routePlan = buildWealthRoute(routeInput);
    const metadata = {
      riskTolerance,
      horizon,
      experienceLevel,
      monthlyContribution,
      maxDrawdownPct,
      maxPositionPct,
      emergencyFundMonths,
      allowCrypto,
      allowPredictionMarkets,
      noLeverage,
      allowedAssetTypes: effectiveAllowedAssets,
      source: 'financial_goals',
      goalIds: goals.map((goal) => goal.id),
      routePlan,
      policy: 'No ejecución real sin confirmación humana, auditoría y controles de riesgo.',
    };

    const { data: disclosure, error: disclosureError } = await supabase
      .from('advisor_disclosures')
      .upsert(
        {
          profile_id: profileId,
          disclosure_type: 'risk_profile',
          version: disclosureVersion,
          accepted_at: new Date().toISOString(),
          metadata,
        },
        { onConflict: 'profile_id,disclosure_type,version' }
      )
      .select('id, accepted_at, metadata')
      .single();

    if (tableMissing(disclosureError)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630000100_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (disclosureError) {
      throw new Error(`No pude guardar el perfil de riesgo: ${disclosureError.message}`);
    }

    const managedLimitTypes = ['max_drawdown_pct', 'max_allocation_pct', 'no_leverage'];
    const { error: deleteLimitsError } = await supabase
      .from('risk_limits')
      .delete()
      .eq('profile_id', profileId)
      .eq('scope', 'portfolio')
      .in('limit_type', managedLimitTypes);

    if (deleteLimitsError) {
      throw new Error(`No pude actualizar límites previos: ${deleteLimitsError.message}`);
    }

    const limitsPayload = [
      {
        profile_id: profileId,
        scope: 'portfolio',
        limit_type: 'max_drawdown_pct',
        limit_value: maxDrawdownPct,
        status: 'active',
        metadata: { source: 'risk_profile' },
      },
      {
        profile_id: profileId,
        scope: 'portfolio',
        limit_type: 'max_allocation_pct',
        limit_value: maxPositionPct,
        status: 'active',
        metadata: { source: 'risk_profile' },
      },
      {
        profile_id: profileId,
        scope: 'portfolio',
        limit_type: 'no_leverage',
        limit_value: noLeverage ? 1 : 0,
        status: 'active',
        metadata: { source: 'risk_profile' },
      },
    ];

    const { data: limits, error: limitsError } = await supabase
      .from('risk_limits')
      .insert(limitsPayload)
      .select('id, scope, limit_type, limit_value, status');

    if (limitsError) {
      throw new Error(`No pude guardar límites de riesgo: ${limitsError.message}`);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'investments.risk_profile.save',
      resourceType: 'advisor_disclosure',
      resourceId: disclosure.id,
      metadata: {
        riskTolerance,
        horizon,
        experienceLevel,
        monthlyContribution,
        maxDrawdownPct,
        maxPositionPct,
        allowCrypto,
        allowPredictionMarkets,
      },
    });

    return NextResponse.json({
      success: true,
      riskProfile: disclosure.metadata,
      routePlan,
      acceptedAt: disclosure.accepted_at,
      limits: limits || [],
      goals: mapGoals(goals),
      eligibility: wealthEligibility,
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'investments.risk_profile.save', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
