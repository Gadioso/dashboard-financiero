import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type MarketAsset = {
  id: string;
  asset_type: string;
  symbol?: string | null;
  name: string;
  currency?: string | null;
  provider?: string | null;
};

type PaperTrade = {
  id: string;
  thesis_id?: string | null;
  asset_id?: string | null;
  side: 'buy' | 'sell';
  status: 'open' | 'closed' | 'cancelled' | 'expired';
  opened_at: string;
  closed_at?: string | null;
  entry_price?: number | null;
  exit_price?: number | null;
  quantity?: number | null;
  notional?: number | null;
  realized_pnl?: number | null;
  max_drawdown?: number | null;
  fees_estimated?: number | null;
  rationale?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function scorecardFor(trades: PaperTrade[]) {
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

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(String(value || '').replace(/[,%\s]/g, ''));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function cleanSide(value: unknown) {
  return value === 'sell' ? 'sell' : 'buy';
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

  if (error) throw new Error(`No pude leer precio de mercado: ${error.message}`);

  const price = Number(data?.price || 0);
  if (!Number.isFinite(price) || price <= 0) throw new Error('No hay precio válido para simular esta tesis.');

  return {
    price,
    snapshotId: data?.id || null,
    capturedAt: data?.captured_at || null,
    provider: data?.provider || null,
  };
}

async function attachAssets({
  supabase,
  trades,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  trades: PaperTrade[];
}) {
  const assetIds = Array.from(new Set(trades.map((trade) => trade.asset_id).filter(Boolean))) as string[];
  const thesisIds = Array.from(new Set(trades.map((trade) => trade.thesis_id).filter(Boolean))) as string[];
  const [{ data: assets, error: assetsError }, { data: theses, error: thesesError }] = await Promise.all([
    assetIds.length > 0
      ? supabase.from('market_assets').select('id, asset_type, symbol, name, currency, provider').in('id', assetIds)
      : Promise.resolve({ data: [], error: null }),
    thesisIds.length > 0
      ? supabase.from('investment_theses').select('id, title, stance, thesis_type, status').in('id', thesisIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assetsError) throw new Error(`No pude leer activos paper: ${assetsError.message}`);
  if (thesesError) throw new Error(`No pude leer tesis paper: ${thesesError.message}`);

  const assetsById = new Map((assets || []).map((asset) => [asset.id, asset as MarketAsset]));
  const thesesById = new Map((theses || []).map((thesis) => [thesis.id, thesis]));

  return trades.map((trade) => ({
    ...trade,
    asset: trade.asset_id ? assetsById.get(trade.asset_id) || null : null,
    thesis: trade.thesis_id ? thesesById.get(trade.thesis_id) || null : null,
  }));
}

async function listTrades({
  supabase,
  profileId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
}) {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('id, thesis_id, asset_id, side, status, opened_at, closed_at, entry_price, exit_price, quantity, notional, realized_pnl, max_drawdown, fees_estimated, rationale, metadata, created_at, updated_at')
    .eq('profile_id', profileId)
    .order('opened_at', { ascending: false })
    .limit(20);

  if (tableMissing(error)) {
    throw new Error('Falta aplicar la migración agentic foundation.');
  }

  if (error) throw new Error(`No pude leer paper trades: ${error.message}`);

  const trades = (data || []) as PaperTrade[];

  return {
    trades: await attachAssets({ supabase, trades }),
    scorecard: scorecardFor(trades),
  };
}

export async function GET(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    return NextResponse.json({ success: true, ...(await listTrades({ supabase, profileId })) });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'paper_trades.list', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { thesisId?: string; side?: string; notional?: number };
    const thesisId = body.thesisId?.trim();
    const side = cleanSide(body.side);
    const notional = cleanNumber(body.notional, 100, 1, 10_000);

    if (!thesisId) return NextResponse.json({ success: false, error: 'Falta thesisId.' }, { status: 400 });

    const { data: thesis, error: thesisError } = await supabase
      .from('investment_theses')
      .select('id, asset_id, business_entity_id, title, summary, stance, status, evidence')
      .eq('id', thesisId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (thesisError) throw new Error(`No pude leer la tesis: ${thesisError.message}`);
    if (!thesis) return NextResponse.json({ success: false, error: 'No encontré esa tesis.' }, { status: 404 });
    if (thesis.status !== 'active') return NextResponse.json({ success: false, error: 'La tesis no está activa.' }, { status: 409 });
    if (!thesis.asset_id) return NextResponse.json({ success: false, error: 'La tesis no tiene activo asociado.' }, { status: 409 });

    const { data: existing, error: existingError } = await supabase
      .from('paper_trades')
      .select('id, thesis_id, asset_id, side, status, opened_at, closed_at, entry_price, exit_price, quantity, notional, realized_pnl, max_drawdown, fees_estimated, rationale, metadata, created_at, updated_at')
      .eq('profile_id', profileId)
      .eq('thesis_id', thesis.id)
      .eq('status', 'open')
      .maybeSingle();

    if (existingError) throw new Error(`No pude revisar paper trades existentes: ${existingError.message}`);

    if (existing) {
      return NextResponse.json({
        success: true,
        created: false,
        trade: (await attachAssets({ supabase, trades: [existing as PaperTrade] }))[0],
        ...(await listTrades({ supabase, profileId })),
      });
    }

    const price = await latestPrice({ supabase, assetId: thesis.asset_id });
    const quantity = notional / price.price;
    const feesEstimated = notional * 0.001;
    const payload = {
      profile_id: profileId,
      business_entity_id: thesis.business_entity_id || null,
      thesis_id: thesis.id,
      asset_id: thesis.asset_id,
      side,
      status: 'open',
      entry_price: price.price,
      quantity,
      notional,
      fees_estimated: feesEstimated,
      rationale: `Paper trade desde tesis: ${thesis.title}`,
      metadata: {
        source: 'paper_trade_v1',
        researchOnly: true,
        executionDisabled: true,
        priceSnapshotId: price.snapshotId,
        priceCapturedAt: price.capturedAt,
        priceProvider: price.provider,
        thesisStance: thesis.stance,
        policy: 'Simulación paper. No ejecuta órdenes reales.',
      },
    };
    const { data, error } = await supabase
      .from('paper_trades')
      .insert(payload)
      .select('id, thesis_id, asset_id, side, status, opened_at, closed_at, entry_price, exit_price, quantity, notional, realized_pnl, max_drawdown, fees_estimated, rationale, metadata, created_at, updated_at')
      .single();

    if (error) throw new Error(`No pude abrir paper trade: ${error.message}`);

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'paper_trade.open',
      resourceType: 'paper_trades',
      resourceId: data.id,
      metadata: { thesisId: thesis.id, side, notional, entryPrice: price.price, executionDisabled: true },
    });

    return NextResponse.json({
      success: true,
      created: true,
      trade: (await attachAssets({ supabase, trades: [data as PaperTrade] }))[0],
      ...(await listTrades({ supabase, profileId })),
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'paper_trade.open', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
