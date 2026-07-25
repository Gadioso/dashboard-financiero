import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function cleanAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });

  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const target = cleanAmount(body.target);
  const current = cleanAmount(body.current);
  const targetDate = String(body.targetDate || '').trim();

  if (target === null || current === null) {
    return NextResponse.json({ success: false, error: 'Los montos deben ser números positivos.' }, { status: 400 });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  const { data: personalizedGoal, error: personalizedGoalError } = isUuid
    ? await supabase
      .from('financial_goals')
      .select('id, name')
      .eq('id', id)
      .eq('profile_id', tenant.profileId)
      .maybeSingle()
    : { data: null, error: null };
  if (personalizedGoalError && !/does not exist|schema cache|Could not find/i.test(personalizedGoalError.message)) {
    return NextResponse.json({ success: false, error: 'No pude consultar la meta.' }, { status: 500 });
  }

  if (personalizedGoal) {
    const { data, error } = await supabase
      .from('financial_goals')
      .update({
        target_amount: target,
        target_date: targetDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', tenant.profileId)
      .select('id, name, current_amount, target_amount, target_date, updated_at')
      .single();
    if (error) return NextResponse.json({ success: false, error: 'No pude guardar la meta.' }, { status: 500 });
    return NextResponse.json({
      success: true,
      goal: {
        id: data.id,
        cuenta: data.name,
        balance_actual: data.current_amount,
        objetivo: data.target_amount,
        fecha_objetivo: data.target_date,
        updated_at: data.updated_at,
      },
    });
  }

  const { data: currentGoal, error: currentGoalError } = await supabase
    .from('fondos_acumulados')
    .select('id, cuenta')
    .eq('id', id)
    .eq('profile_id', tenant.profileId)
    .maybeSingle();
  if (currentGoalError || !currentGoal) return NextResponse.json({ success: false, error: 'Meta no encontrada.' }, { status: 404 });

  const { data: settingsRow } = await supabase
    .from('advisor_disclosures')
    .select('metadata')
    .eq('profile_id', tenant.profileId)
    .eq('disclosure_type', 'personalized_advice')
    .eq('version', 'financial-goals-v1')
    .maybeSingle();
  const metadata = (settingsRow?.metadata || {}) as { goals?: Record<string, { target?: number; targetDate?: string | null }> };
  const goals = { ...(metadata.goals || {}), [id]: { target, targetDate: targetDate || null } };

  const { data, error } = await supabase
    .from('fondos_acumulados')
    .update({
      balance_actual: current,
      ultima_actualizacion: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('profile_id', tenant.profileId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const { error: settingsError } = await supabase.from('advisor_disclosures').upsert({
    profile_id: tenant.profileId,
    disclosure_type: 'personalized_advice',
    version: 'financial-goals-v1',
    accepted_at: new Date().toISOString(),
    metadata: { goals },
  }, { onConflict: 'profile_id,disclosure_type,version' });
  if (settingsError) return NextResponse.json({ success: false, error: settingsError.message }, { status: 500 });
  return NextResponse.json({ success: true, goal: { ...data, objetivo: target, fecha_objetivo: targetDate || null } });
}
