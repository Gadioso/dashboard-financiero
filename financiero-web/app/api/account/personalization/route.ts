import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { syncPersonalizedGoals } from '@/lib/personalized-goals';

const fields = [
  'birth_year', 'occupation', 'industry', 'work_model', 'income_sources', 'income_growth_goal',
  'short_term_goals', 'medium_term_goals', 'long_term_goals', 'financial_concerns',
  'valued_pleasures', 'pleasures_to_reduce', 'recurring_life_costs', 'recurring_investments',
  'emergency_fund_status', 'investment_experience', 'risk_tolerance', 'recommendation_style',
  'goal_priorities', 'monthly_goal_capacity',
  'work_essential_costs',
] as const;
const arrayFields = new Set(['income_sources', 'short_term_goals', 'medium_term_goals', 'long_term_goals', 'financial_concerns', 'valued_pleasures', 'pleasures_to_reduce', 'recurring_life_costs', 'recurring_investments', 'goal_priorities', 'work_essential_costs']);

function cleanText(value: unknown) {
  return String(value || '').trim().slice(0, 500) || null;
}

function cleanArray(value: unknown) {
  return (Array.isArray(value) ? value : String(value || '').split(/[\n,]/))
    .map(cleanText).filter((item): item is string => Boolean(item)).slice(0, 20);
}

async function context(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  return { supabase, tenant };
}

export async function GET(request: Request) {
  const { supabase, tenant } = await context(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const [personalizationResult, profileResult] = await Promise.all([
    supabase.from('financial_personalization_profiles').select('*').eq('profile_id', tenant.profileId).maybeSingle(),
    supabase.from('profiles').select('full_name, monthly_income_target').eq('id', tenant.profileId).maybeSingle(),
  ]);
  if (personalizationResult.error || profileResult.error) return NextResponse.json({ success: false, error: 'No pude cargar tu perfil financiero.' }, { status: 500 });
  return NextResponse.json({ success: true, personalization: { ...(personalizationResult.data || {}), ...(profileResult.data || {}) } });
}

export async function PUT(request: Request) {
  try {
    const { supabase, tenant } = await context(request);
    if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const hasGoalAnswers = ['short_term_goals', 'medium_term_goals', 'long_term_goals', 'goal_priorities']
      .some((field) => cleanArray(body[field]).length > 0);
    if (body.completed === true && !hasGoalAnswers) {
      return NextResponse.json({ success: false, error: 'Agrega al menos una meta antes de completar el perfil.' }, { status: 400 });
    }
    const payload: Record<string, unknown> = { profile_id: tenant.profileId, updated_at: new Date().toISOString() };
    for (const field of fields) payload[field] = arrayFields.has(field) ? cleanArray(body[field]) : cleanText(body[field]);
    const birthYear = Number(body.birth_year);
    payload.birth_year = Number.isInteger(birthYear) && birthYear >= 1900 && birthYear <= new Date().getFullYear() ? birthYear : null;
    const monthlyGoalCapacity = Number(body.monthly_goal_capacity);
    payload.monthly_goal_capacity = Number.isFinite(monthlyGoalCapacity) && monthlyGoalCapacity >= 0 ? monthlyGoalCapacity : 0;
    if (body.completed === true) payload.interview_completed_at = new Date().toISOString();
    const monthlyIncomeTarget = Number(body.monthly_income_target);
    const profilePayload = {
      full_name: cleanText(body.full_name),
      monthly_income_target: Number.isFinite(monthlyIncomeTarget) && monthlyIncomeTarget >= 0 ? monthlyIncomeTarget : 0,
      updated_at: new Date().toISOString(),
    };
    const [personalizationResult, profileResult] = await Promise.all([
      supabase.from('financial_personalization_profiles').upsert(payload, { onConflict: 'profile_id' }).select('*').single(),
      supabase.from('profiles').update(profilePayload).eq('id', tenant.profileId).select('full_name, monthly_income_target').single(),
    ]);
    if (personalizationResult.error || profileResult.error) return NextResponse.json({ success: false, error: 'No pude guardar tus respuestas. Intenta nuevamente.' }, { status: 500 });
    const data = { ...personalizationResult.data, ...profileResult.data };
    const goalSync = body.completed === true ? await syncPersonalizedGoals({ supabase, profileId: tenant.profileId, personalization: data }) : null;
    return NextResponse.json({ success: true, personalization: data, goalSync });
  } catch {
    return NextResponse.json({ success: false, error: 'Guardamos tus respuestas, pero no pudimos preparar tus metas. Intenta guardar nuevamente.' }, { status: 500 });
  }
}
