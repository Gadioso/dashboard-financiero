import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

function cleanAction(value: unknown) {
  return value === 'cancel' ? 'cancel' : 'close';
}

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

async function scorecardForProfile({
  supabase,
  profileId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
}) {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('id, status, notional, realized_pnl')
    .eq('profile_id', profileId);

  if (tableMissing(error)) return null;
  if (error) throw new Error(`No pude calcular score de paper trading: ${error.message}`);

  const trades = data || [];
  const closed = trades.filter((trade) => trade.status === 'closed');
  const pnlValues = closed.map((trade) => Number(trade.realized_pnl || 0));
  const wins = pnlValues.filter((pnl) => pnl > 0).length;
  const losses = pnlValues.filter((pnl) => pnl < 0).length;
  const totalPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0);
  const totalNotional = closed.reduce((sum, trade) => sum + Number(trade.notional || 0), 0);

  return {
    total: trades.length,
    open: trades.filter((trade) => trade.status === 'open').length,
    closed: closed.length,
    wins,
    losses,
    winRate: closed.length > 0 ? Number((wins / closed.length).toFixed(4)) : 0,
    totalPnl: Number(totalPnl.toFixed(2)),
    averagePnl: closed.length > 0 ? Number((totalPnl / closed.length).toFixed(2)) : 0,
    bestPnl: pnlValues.length > 0 ? Number(Math.max(...pnlValues).toFixed(2)) : 0,
    worstPnl: pnlValues.length > 0 ? Number(Math.min(...pnlValues).toFixed(2)) : 0,
    totalNotional: Number(totalNotional.toFixed(2)),
    pnlPct: totalNotional > 0 ? Number((totalPnl / totalNotional).toFixed(4)) : 0,
  };
}

async function latestPrice({
  supabase,
  assetId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  assetId: string;
}) {
  const { data, error } = await supabase
    .from('market_data_snapshots')
    .select('id, price, captured_at, provider')
    .eq('asset_id', assetId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No pude leer precio de cierre: ${error.message}`);

  const price = Number(data?.price || 0);
  if (!Number.isFinite(price) || price <= 0) throw new Error('No hay precio válido para cerrar esta simulación.');

  return {
    price,
    snapshotId: data?.id || null,
    capturedAt: data?.captured_at || null,
    provider: data?.provider || null,
  };
}

function realizedPnl({
  side,
  entry,
  exit,
  quantity,
  fees,
}: {
  side: string;
  entry: number;
  exit: number;
  quantity: number;
  fees: number;
}) {
  const gross = side === 'sell' ? (entry - exit) * quantity : (exit - entry) * quantity;
  return Number((gross - fees).toFixed(2));
}

async function closeLinkedThesis({
  supabase,
  profileId,
  thesisId,
  tradeId,
  pnl,
  exitPrice,
  entryPrice,
  quantity,
  side,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
  thesisId?: string | null;
  tradeId: string;
  pnl: number;
  exitPrice: number;
  entryPrice: number;
  quantity: number;
  side: string;
}) {
  if (!thesisId) return null;

  const { data: thesis, error: thesisError } = await supabase
    .from('investment_theses')
    .select('id, title, evidence')
    .eq('id', thesisId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (tableMissing(thesisError)) return null;
  if (thesisError) throw new Error(`No pude leer tesis para post-mortem: ${thesisError.message}`);
  if (!thesis) return null;

  const outcome = pnl > 0 ? 'validated' : pnl < 0 ? 'invalidated' : 'flat';
  const evidence = (thesis.evidence || {}) as Record<string, unknown>;
  const postMortem = {
    outcome,
    closedAt: new Date().toISOString(),
    paperTradeId: tradeId,
    realizedPnl: pnl,
    entryPrice,
    exitPrice,
    quantity,
    side,
    lesson: pnl > 0
      ? 'La tesis produjo PnL positivo en paper. Mantener como patron a comparar, no como permiso de ejecucion real.'
      : pnl < 0
        ? 'La tesis fallo en paper. Revisar evidencia, liquidez, timing y reglas de invalidacion antes de repetir.'
        : 'La tesis cerro plana en paper. Revisar si el costo de oportunidad justifica mantener este tipo de senal.',
  };

  const { data: updated, error: updateError } = await supabase
    .from('investment_theses')
    .update({
      status: 'closed',
      evidence: {
        ...evidence,
        postMortem,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', thesisId)
    .eq('profile_id', profileId)
    .select('id, asset_id, thesis_type, title, summary, stance, horizon, confidence, status, evidence, invalidation_rules, created_by_agent, created_at, updated_at')
    .single();

  if (updateError) throw new Error(`No pude cerrar tesis con post-mortem: ${updateError.message}`);

  return updated;
}

export async function PATCH(request: Request, context: RouteContext) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ success: false, error: 'Falta ID de paper trade.' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = cleanAction(body.action);

    const { data: trade, error: tradeError } = await supabase
      .from('paper_trades')
      .select('id, thesis_id, asset_id, side, status, entry_price, quantity, notional, fees_estimated, metadata')
      .eq('id', id)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (tradeError) throw new Error(`No pude leer paper trade: ${tradeError.message}`);
    if (!trade) return NextResponse.json({ success: false, error: 'No encontré el paper trade.' }, { status: 404 });
    if (trade.status !== 'open') return NextResponse.json({ success: false, error: 'El paper trade ya no está abierto.' }, { status: 409 });

    if (action === 'cancel') {
      const { data, error } = await supabase
        .from('paper_trades')
        .update({
          status: 'cancelled',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...((trade.metadata || {}) as Record<string, unknown>),
            cancelledByUser: true,
          },
        })
        .eq('id', id)
        .eq('profile_id', profileId)
        .select('id, thesis_id, asset_id, side, status, opened_at, closed_at, entry_price, exit_price, quantity, notional, realized_pnl, max_drawdown, fees_estimated, rationale, metadata, created_at, updated_at')
        .single();

      if (error) throw new Error(`No pude cancelar paper trade: ${error.message}`);

      await logAuditEvent({ supabase, request, profileId, actorEmail, action: 'paper_trade.cancel', resourceType: 'paper_trades', resourceId: data.id });

      return NextResponse.json({ success: true, trade: data, scorecard: await scorecardForProfile({ supabase, profileId }) });
    }

    if (!trade.asset_id) return NextResponse.json({ success: false, error: 'El paper trade no tiene activo asociado.' }, { status: 409 });

    const price = await latestPrice({ supabase, assetId: trade.asset_id });
    const entry = Number(trade.entry_price || 0);
    const quantity = Number(trade.quantity || 0);
    const fees = Number(trade.fees_estimated || 0);
    const pnl = realizedPnl({ side: trade.side, entry, exit: price.price, quantity, fees });
    const maxDrawdown = trade.side === 'sell'
      ? Math.min(0, (entry - price.price) / entry)
      : Math.min(0, (price.price - entry) / entry);

    const { data, error } = await supabase
      .from('paper_trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        exit_price: price.price,
        realized_pnl: pnl,
        max_drawdown: Number(maxDrawdown.toFixed(6)),
        updated_at: new Date().toISOString(),
        metadata: {
          ...((trade.metadata || {}) as Record<string, unknown>),
          closeSnapshotId: price.snapshotId,
          closePriceCapturedAt: price.capturedAt,
          closePriceProvider: price.provider,
        },
      })
      .eq('id', id)
      .eq('profile_id', profileId)
      .select('id, thesis_id, asset_id, side, status, opened_at, closed_at, entry_price, exit_price, quantity, notional, realized_pnl, max_drawdown, fees_estimated, rationale, metadata, created_at, updated_at')
      .single();

    if (error) throw new Error(`No pude cerrar paper trade: ${error.message}`);

    const thesis = await closeLinkedThesis({
      supabase,
      profileId,
      thesisId: trade.thesis_id,
      tradeId: data.id,
      pnl,
      exitPrice: price.price,
      entryPrice: entry,
      quantity,
      side: trade.side,
    });

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'paper_trade.close',
      resourceType: 'paper_trades',
      resourceId: data.id,
      metadata: { exitPrice: price.price, realizedPnl: pnl, thesisClosed: Boolean(thesis), executionDisabled: true },
    });

    return NextResponse.json({ success: true, trade: data, thesis, scorecard: await scorecardForProfile({ supabase, profileId }) });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'paper_trade.update', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
