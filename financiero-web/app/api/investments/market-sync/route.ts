import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getPrivateProfileId, getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  volume: string;
  quoteVolume: string;
  priceChangePercent?: string;
};

type PolymarketMarket = {
  id: string;
  question?: string;
  slug?: string;
  volume?: string | number;
  liquidity?: string | number;
  outcomes?: string;
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
};

type MarketAssetRow = {
  id: string;
  asset_type: string;
  symbol?: string | null;
  name: string;
  exchange?: string | null;
  currency?: string | null;
  provider?: string | null;
  provider_asset_id?: string | null;
};

type MarketSnapshotRow = {
  id: string;
  asset_id?: string | null;
  provider: string;
  captured_at: string;
  price?: number | null;
  bid?: number | null;
  ask?: number | null;
  spread_bps?: number | null;
  volume_24h?: number | null;
  raw?: Record<string, unknown> | null;
};

type ProviderSyncResult = {
  provider: 'binance' | 'polymarket';
  snapshots: MarketSnapshotRow[];
  error?: string;
  code?: string;
  severity?: 'warning' | 'error';
};

const binanceSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

class ProviderUnavailableError extends Error {
  provider: ProviderSyncResult['provider'];
  code: string;
  status?: number;

  constructor({
    provider,
    message,
    code,
    status,
  }: {
    provider: ProviderSyncResult['provider'];
    message: string;
    code: string;
    status?: number;
  }) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

function providerErrorResult(provider: ProviderSyncResult['provider'], reason: unknown): ProviderSyncResult {
  const message = reason instanceof Error ? reason.message : `${provider} no respondió.`;

  if (reason instanceof ProviderUnavailableError) {
    return {
      provider,
      snapshots: [],
      error: message,
      code: reason.code,
      severity: 'warning',
    };
  }

  return {
    provider,
    snapshots: [],
    error: message,
    severity: 'error',
  };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

function isCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';

  if (!cronSecret) return false;

  return getBearerToken(request) === cronSecret;
}

function parseNumber(value?: string | number | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : null;
}

function spreadBps({ bid, ask }: { bid?: number | null; ask?: number | null }) {
  if (!bid || !ask || bid <= 0 || ask <= 0) return null;
  const mid = (bid + ask) / 2;
  return Number((((ask - bid) / mid) * 10_000).toFixed(4));
}

function parseJsonArray(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function upsertMarketAsset({
  supabase,
  asset,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  asset: {
    asset_type: string;
    symbol?: string | null;
    name: string;
    exchange?: string | null;
    currency?: string | null;
    provider: string;
    provider_asset_id: string;
    metadata?: Record<string, unknown>;
  };
}) {
  const { data, error } = await supabase
    .from('market_assets')
    .upsert({
      ...asset,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider,provider_asset_id' })
    .select('id, asset_type, symbol, name, exchange, currency, provider, provider_asset_id')
    .single();

  if (error) throw new Error(`No pude guardar activo de mercado ${asset.provider}:${asset.provider_asset_id}: ${error.message}`);

  return data as MarketAssetRow;
}

async function syncBinance(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>) {
  const symbolsParam = encodeURIComponent(JSON.stringify(binanceSymbols));
  const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`, { cache: 'no-store' });

  if (response.status === 451) {
    throw new ProviderUnavailableError({
      provider: 'binance',
      code: 'binance_region_unavailable',
      status: response.status,
      message: 'Binance no esta disponible desde esta region/red (HTTP 451).',
    });
  }

  if (!response.ok) throw new Error(`Binance respondió ${response.status}.`);

  const tickers = (await response.json()) as BinanceTicker[];
  const snapshots = [];

  for (const ticker of tickers) {
    const asset = await upsertMarketAsset({
      supabase,
      asset: {
        asset_type: 'crypto',
        symbol: ticker.symbol,
        name: ticker.symbol.replace('USDT', '/USDT'),
        exchange: 'Binance Spot',
        currency: 'USDT',
        provider: 'binance',
        provider_asset_id: ticker.symbol,
        metadata: { source: 'binance_24hr_ticker' },
      },
    });
    const bid = parseNumber(ticker.bidPrice);
    const ask = parseNumber(ticker.askPrice);

    snapshots.push({
      asset_id: asset.id,
      provider: 'binance',
      price: parseNumber(ticker.lastPrice),
      bid,
      ask,
      spread_bps: spreadBps({ bid, ask }),
      volume_24h: parseNumber(ticker.quoteVolume),
      raw: ticker,
    });
  }

  const { data, error } = await supabase
    .from('market_data_snapshots')
    .insert(snapshots)
    .select('id, asset_id, provider, captured_at, price, bid, ask, spread_bps, volume_24h, raw');

  if (error) throw new Error(`No pude guardar snapshots Binance: ${error.message}`);

  return data as MarketSnapshotRow[];
}

async function syncPolymarket(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>) {
  const response = await fetch('https://gamma-api.polymarket.com/markets/keyset?closed=false&limit=5&order=volume&ascending=false', { cache: 'no-store' });

  if (!response.ok) throw new Error(`Polymarket respondió ${response.status}.`);

  const payload = await response.json();
  const markets = (Array.isArray(payload) ? payload : payload.markets || []) as PolymarketMarket[];
  const snapshots = [];

  for (const market of markets.slice(0, 5)) {
    const outcomes = parseJsonArray(market.outcomes);
    const prices = parseJsonArray(market.outcomePrices).map(Number);
    const yesIndex = outcomes.findIndex((outcome) => String(outcome).toLowerCase() === 'yes');
    const yesPrice = yesIndex >= 0 ? parseNumber(prices[yesIndex]) : parseNumber(prices[0]);
    const asset = await upsertMarketAsset({
      supabase,
      asset: {
        asset_type: 'prediction_market',
        symbol: market.slug || market.id,
        name: market.question || market.slug || `Polymarket ${market.id}`,
        exchange: 'Polymarket',
        currency: 'USDC',
        provider: 'polymarket',
        provider_asset_id: String(market.id),
        metadata: {
          slug: market.slug,
          outcomes,
          active: market.active,
          closed: market.closed,
        },
      },
    });

    snapshots.push({
      asset_id: asset.id,
      provider: 'polymarket',
      price: yesPrice,
      bid: null,
      ask: null,
      spread_bps: null,
      volume_24h: parseNumber(market.volume),
      raw: market as Record<string, unknown>,
    });
  }

  const { data, error } = await supabase
    .from('market_data_snapshots')
    .insert(snapshots)
    .select('id, asset_id, provider, captured_at, price, bid, ask, spread_bps, volume_24h, raw');

  if (error) throw new Error(`No pude guardar snapshots Polymarket: ${error.message}`);

  return data as MarketSnapshotRow[];
}

async function latestSnapshots(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>) {
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('market_data_snapshots')
    .select('id, asset_id, provider, captured_at, price, bid, ask, spread_bps, volume_24h, raw')
    .order('captured_at', { ascending: false })
    .limit(24);

  if (snapshotsError) throw new Error(`No pude leer snapshots de mercado: ${snapshotsError.message}`);

  const rows = (snapshots || []) as MarketSnapshotRow[];
  const assetIds = Array.from(new Set(rows.map((snapshot) => snapshot.asset_id).filter(Boolean))) as string[];
  const { data: assets, error: assetsError } = assetIds.length > 0
    ? await supabase
        .from('market_assets')
        .select('id, asset_type, symbol, name, exchange, currency, provider, provider_asset_id')
        .in('id', assetIds)
    : { data: [], error: null };

  if (assetsError) throw new Error(`No pude leer activos de mercado: ${assetsError.message}`);

  const assetsById = new Map((assets || []).map((asset) => [asset.id, asset as MarketAssetRow]));
  const seen = new Set<string>();

  return rows
    .filter((snapshot) => {
      const key = `${snapshot.provider}:${snapshot.asset_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((snapshot) => ({
      ...snapshot,
      asset: snapshot.asset_id ? assetsById.get(snapshot.asset_id) || null : null,
    }));
}

async function runMarketSync({
  supabase,
  request,
  profileId,
  actorEmail,
  source,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  request: Request;
  profileId: string | null;
  actorEmail?: string | null;
  source: 'cron' | 'user';
}) {
  const providerResults = await Promise.allSettled([
    syncBinance(supabase),
    syncPolymarket(supabase),
  ]);
  const [cryptoResult, polymarketResult] = providerResults;
  const cryptoSync: ProviderSyncResult = cryptoResult.status === 'fulfilled'
    ? { provider: 'binance', snapshots: cryptoResult.value }
    : providerErrorResult('binance', cryptoResult.reason);
  const polymarket: ProviderSyncResult = polymarketResult.status === 'fulfilled'
    ? { provider: 'polymarket', snapshots: polymarketResult.value }
    : providerErrorResult('polymarket', polymarketResult.reason);
  const inserted = cryptoSync.snapshots.length + polymarket.snapshots.length;
  const providerErrors = [cryptoSync, polymarket].filter((result) => result.error);
  const blockingErrors = providerErrors.filter((result) => result.severity !== 'warning');

  if (inserted === 0 && blockingErrors.length > 0) {
    throw new Error(blockingErrors.map((result) => result.error).filter(Boolean).join(' · ') || 'No se pudo sincronizar ninguna fuente de mercado.');
  }

  await logAuditEvent({
    supabase,
    request,
    profileId,
    actorEmail,
    action: 'investment_market_sync.run',
    resourceType: 'workflow',
    resourceId: 'market_sync_read_only_v1',
    metadata: {
      source,
      binance: cryptoSync.snapshots.length,
      polymarket: polymarket.snapshots.length,
      partial: Boolean(cryptoSync.error || polymarket.error),
      warnings: providerErrors.filter((result) => result.severity === 'warning').map((result) => result.error),
      errors: blockingErrors.map((result) => result.error),
      codes: providerErrors.map((result) => result.code).filter(Boolean),
    },
  });

  return {
    success: true,
    partial: Boolean(cryptoSync.error || polymarket.error),
    inserted,
    binance: cryptoSync.snapshots.length,
    polymarket: polymarket.snapshots.length,
    warnings: [cryptoSync.error, polymarket.error].filter(Boolean),
    snapshots: await latestSnapshots(supabase),
  };
}

export async function GET(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

    if (isCronRequest(request)) {
      profileId = getPrivateProfileId();
      actorEmail = 'cron@dashboard-financiero.local';

      return NextResponse.json(await runMarketSync({ supabase, request, profileId, actorEmail, source: 'cron' }));
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    return NextResponse.json({ success: true, snapshots: await latestSnapshots(supabase) });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'investment_market_sync.list', error });
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

    return NextResponse.json(await runMarketSync({ supabase, request, profileId, actorEmail, source: 'user' }));
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'investment_market_sync.run', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
