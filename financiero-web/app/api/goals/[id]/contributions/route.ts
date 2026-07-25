import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const stopWords = new Set(['para', 'una', 'uno', 'unos', 'unas', 'con', 'mis', 'las', 'los', 'del', 'por', 'que', 'quiero', 'ahorrar', 'fondo']);

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function cleanAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function goalTokens(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token)).slice(0, 5);
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
    supabase.from('financial_goal_contributions').select('id, amount, contributed_at, source, status, confidence, note, bank_transaction_id, created_at').eq('profile_id', tenant.profileId).eq('goal_id', id).order('contributed_at', { ascending: false }).limit(100),
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

  if (body.action === 'scan') {
    const tokens = goalTokens(goal.name);
    if (!tokens.length) return NextResponse.json({ success: true, suggested: 0 });
    const since = new Date(); since.setDate(since.getDate() - 120);
    const { data: transactions, error: transactionError } = await supabase.from('bank_transactions_raw')
      .select('id, amount, posted_at, authorized_at, description, merchant_name, currency')
      .eq('profile_id', tenant.profileId).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(500);
    if (transactionError) return NextResponse.json({ success: false, error: 'No pude revisar tus movimientos.' }, { status: 500 });
    const matches = (transactions || []).filter((transaction) => {
      const haystack = `${transaction.description || ''} ${transaction.merchant_name || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    }).slice(0, 20);
    if (!matches.length) return NextResponse.json({ success: true, suggested: 0 });
    const rows = matches.map((transaction) => ({
      profile_id: tenant.profileId, goal_id: id, amount: Math.abs(Number(transaction.amount || 0)),
      contributed_at: transaction.posted_at || String(transaction.authorized_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      source: 'bank_transaction', bank_transaction_id: transaction.id, status: 'suggested', confidence: 0.65,
      note: transaction.description || transaction.merchant_name || 'Movimiento detectado', metadata: { matchedTokens: tokens, currency: transaction.currency || 'MXN' },
    })).filter((row) => row.amount > 0);
    const transactionIds = rows.map((row) => row.bank_transaction_id);
    const { data: existing } = await supabase.from('financial_goal_contributions').select('bank_transaction_id').eq('goal_id', id).in('bank_transaction_id', transactionIds);
    const existingIds = new Set((existing || []).map((row) => row.bank_transaction_id));
    const pendingRows = rows.filter((row) => !existingIds.has(row.bank_transaction_id));
    if (!pendingRows.length) return NextResponse.json({ success: true, suggested: 0 });
    const { data, error } = await supabase.from('financial_goal_contributions').insert(pendingRows).select('id');
    if (tableMissing(error)) return NextResponse.json({ success: false, error: 'Falta activar el seguimiento automático de aportaciones.', migration: '20260724_goal_contribution_tracking.sql' }, { status: 409 });
    if (error) return NextResponse.json({ success: false, error: 'No pude preparar las sugerencias.' }, { status: 500 });
    return NextResponse.json({ success: true, suggested: data?.length || 0 });
  }

  return NextResponse.json({ success: false, error: 'Acción no válida.' }, { status: 400 });
}
