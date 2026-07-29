import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function cleanAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

async function getGoal(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>, profileId: string, id: string) {
  return supabase.from('financial_goals').select('id, name, current_amount, target_amount, target_date').eq('id', id).eq('profile_id', profileId).maybeSingle();
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const { id } = await context.params;
  const [{ data: goal, error: goalError }, contributionsResult] = await Promise.all([
    getGoal(supabase, tenant.profileId, id),
    supabase.from('financial_goal_contributions').select('id, amount, contributed_at, source, status, confidence, note, created_at').eq('profile_id', tenant.profileId).eq('goal_id', id).order('contributed_at', { ascending: false }).limit(100),
  ]);
  if (goalError || !goal) return NextResponse.json({ success: false, error: 'Meta no encontrada.' }, { status: 404 });
  if (tableMissing(contributionsResult.error)) return NextResponse.json({ success: false, error: 'Falta activar el seguimiento automático de aportaciones.', migration: '20260724_goal_contribution_tracking.sql' }, { status: 409 });
  if (contributionsResult.error) return NextResponse.json({ success: false, error: 'No pude consultar las aportaciones.' }, { status: 500 });
  return NextResponse.json({ success: true, goal, contributions: contributionsResult.data || [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { data: goal, error: goalError } = await getGoal(supabase, tenant.profileId, id);
  if (goalError || !goal) return NextResponse.json({ success: false, error: 'Meta no encontrada.' }, { status: 404 });

  if (body.action === 'record_manual') {
    const amount = cleanAmount(body.amount);
    if (!amount) return NextResponse.json({ success: false, error: 'Escribe una aportación mayor a cero.' }, { status: 400 });
    const { data, error } = await supabase.from('financial_goal_contributions').insert({
      profile_id: tenant.profileId, goal_id: id, amount, source: 'manual', status: 'confirmed',
      contributed_at: String(body.contributedAt || new Date().toISOString().slice(0, 10)), note: String(body.note || '').trim().slice(0, 300) || null,
    }).select('id, amount, contributed_at, source, status, note').single();
    if (tableMissing(error)) return NextResponse.json({ success: false, error: 'Falta activar el seguimiento automático de aportaciones.', migration: '20260724_goal_contribution_tracking.sql' }, { status: 409 });
    if (error) return NextResponse.json({ success: false, error: 'No pude registrar la aportación.' }, { status: 500 });
    return NextResponse.json({ success: true, contribution: data });
  }

  if (body.action === 'review') {
    const contributionId = String(body.contributionId || '');
    const status = body.decision === 'confirm' ? 'confirmed' : 'rejected';
    const { data, error } = await supabase.from('financial_goal_contributions').update({ status, updated_at: new Date().toISOString() }).eq('id', contributionId).eq('goal_id', id).eq('profile_id', tenant.profileId).select('id, status').single();
    if (error) return NextResponse.json({ success: false, error: 'No pude actualizar la sugerencia.' }, { status: 500 });
    return NextResponse.json({ success: true, contribution: data });
  }

  return NextResponse.json({ success: false, error: 'Acción no válida.' }, { status: 400 });
}
