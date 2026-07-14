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
  exchange?: string | null;
  currency?: string | null;
  provider?: string | null;
  provider_asset_id?: string | null;
};

type MarketSnapshot = {
  id: string;
  asset_id?: string | null;
  provider: string;
  captured_at: string;
  price?: number | string | null;
  bid?: number | string | null;
  ask?: number | string | null;
  spread_bps?: number | string | null;
  volume_24h?: number | string | null;
  raw?: Record<string, unknown> | null;
  asset?: MarketAsset | null;
};

type RiskProfile = {
  riskTolerance?: string;
  horizon?: 'short' | 'medium' | 'long';
  allowCrypto?: boolean;
  allowPredictionMarkets?: boolean;
  noLeverage?: boolean;
  allowedAssetTypes?: string[];
  maxPositionPct?: number;
};

type ThesisPayload = {
  profile_id: string;
  asset_id: string;
  thesis_type: 'research' | 'watchlist' | 'prediction_market';
  title: string;
  summary: string;
  stance: 'neutral' | 'avoid';
  horizon: 'short' | 'medium' | 'long';
  confidence: number;
  expected_return: null;
  max_loss_scenario: number | null;
  status: 'active';
  evidence: Record<string, unknown>;
  invalidation_rules: Array<Record<string, unknown>>;
  created_by_agent: string;
};

const agentKey = 'investment_research_agent';

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function numeric(value?: number | string | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRiskAllowedTypes(riskProfile: RiskProfile | null) {
  if (!riskProfile) return new Set(['cash', 'bond', 'fund', 'etf', 'stock']);

  return new Set(riskProfile.allowedAssetTypes || []);
}

function isAssetAllowed(asset: MarketAsset, riskProfile: RiskProfile | null) {
  const allowedTypes = getRiskAllowedTypes(riskProfile);

  if (asset.asset_type === 'crypto') return Boolean(riskProfile?.allowCrypto) && allowedTypes.has('crypto');
  if (asset.asset_type === 'prediction_market') return Boolean(riskProfile?.allowPredictionMarkets) && allowedTypes.has('prediction_market');

  return allowedTypes.has(asset.asset_type);
}

function confidenceFor(snapshot: MarketSnapshot) {
  const asset = snapshot.asset;
  const volume = numeric(snapshot.volume_24h);
  const spread = numeric(snapshot.spread_bps);
  const price = numeric(snapshot.price);

  if (!asset) return 0;

  if (asset.asset_type === 'crypto') {
    const volumeScore = volume > 100_000_000 ? 0.36 : volume > 10_000_000 ? 0.26 : 0.16;
    const spreadScore = spread > 0 && spread < 2 ? 0.32 : spread < 10 ? 0.24 : 0.12;
    const priceScore = price > 0 ? 0.22 : 0.05;
    return Number(Math.min(0.9, volumeScore + spreadScore + priceScore).toFixed(4));
  }

  if (asset.asset_type === 'prediction_market') {
    const liquidityScore = volume > 100_000 ? 0.32 : volume > 5_000 ? 0.22 : 0.12;
    const probabilityScore = price > 0.03 && price < 0.97 ? 0.28 : 0.12;
    const sourceScore = asset.provider === 'polymarket' ? 0.18 : 0.1;
    return Number(Math.min(0.82, liquidityScore + probabilityScore + sourceScore).toFixed(4));
  }

  return 0.45;
}

function buildThesis(snapshot: MarketSnapshot, riskProfile: RiskProfile | null): ThesisPayload | null {
  const asset = snapshot.asset;
  if (!asset?.id || !isAssetAllowed(asset, riskProfile)) return null;

  const price = numeric(snapshot.price);
  const volume = numeric(snapshot.volume_24h);
  const confidence = confidenceFor(snapshot);
  const horizon = riskProfile?.horizon || 'medium';
  const isPredictionMarket = asset.asset_type === 'prediction_market';
  const shouldAvoid = confidence < 0.45 || (isPredictionMarket && (price <= 0.02 || price >= 0.98));
  const thesisType = isPredictionMarket ? 'prediction_market' : asset.asset_type === 'crypto' ? 'watchlist' : 'research';
  const assetLabel = asset.symbol || asset.name;
  const riskLine = isPredictionMarket
    ? 'Mercado predictivo: revisar reglas de resolución, liquidez, sesgo informativo y restricciones geográficas antes de cualquier simulación.'
    : 'Activo de mercado: revisar concentración, volatilidad, liquidez y coherencia con el perfil de riesgo antes de cualquier simulación.';

  return {
    profile_id: '',
    asset_id: asset.id,
    thesis_type: thesisType,
    title: `${assetLabel}: investigación ${shouldAvoid ? 'con cautela' : 'en watchlist'}`,
    summary: `${assetLabel} entra como tesis de investigación, no como recomendación de compra. Precio observado ${price || 'n/d'} con volumen 24h ${volume || 'n/d'}. ${riskLine}`,
    stance: shouldAvoid ? 'avoid' : 'neutral',
    horizon,
    confidence,
    expected_return: null,
    max_loss_scenario: isPredictionMarket ? 1 : null,
    status: 'active',
    evidence: {
      source: 'investment_research_agent_v1',
      snapshotId: snapshot.id,
      provider: snapshot.provider,
      capturedAt: snapshot.captured_at,
      price,
      bid: numeric(snapshot.bid),
      ask: numeric(snapshot.ask),
      spreadBps: numeric(snapshot.spread_bps),
      volume24h: volume,
      riskProfile: riskProfile || null,
      policy: 'Research/paper only. No ejecución real, no recomendación personalizada de compra/venta.',
    },
    invalidation_rules: [
      { type: 'stale_market_data', description: 'Invalidar si no hay snapshot fresco antes de revisar la tesis.' },
      { type: 'risk_profile_change', description: 'Revisar si cambia tolerancia de riesgo, horizonte o activos permitidos.' },
      ...(isPredictionMarket
        ? [{ type: 'resolution_or_liquidity_change', description: 'Revisar si cambian reglas de resolución, liquidez o probabilidad implicita.' }]
        : [{ type: 'liquidity_or_spread_change', description: 'Revisar si el spread o volumen se deterioran materialmente.' }]),
    ],
    created_by_agent: agentKey,
  };
}

async function latestMarketSnapshots(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>) {
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('market_data_snapshots')
    .select('id, asset_id, provider, captured_at, price, bid, ask, spread_bps, volume_24h, raw')
    .order('captured_at', { ascending: false })
    .limit(60);

  if (snapshotsError) throw new Error(`No pude leer snapshots de mercado: ${snapshotsError.message}`);

  const rows = (snapshots || []) as MarketSnapshot[];
  const assetIds = Array.from(new Set(rows.map((snapshot) => snapshot.asset_id).filter(Boolean))) as string[];
  const { data: assets, error: assetsError } = assetIds.length > 0
    ? await supabase
        .from('market_assets')
        .select('id, asset_type, symbol, name, exchange, currency, provider, provider_asset_id')
        .in('id', assetIds)
    : { data: [], error: null };

  if (assetsError) throw new Error(`No pude leer activos de mercado: ${assetsError.message}`);

  const assetsById = new Map((assets || []).map((asset) => [asset.id, asset as MarketAsset]));
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

async function latestTheses({
  supabase,
  profileId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
}) {
  const { data: theses, error: thesesError } = await supabase
    .from('investment_theses')
    .select('id, asset_id, thesis_type, title, summary, stance, horizon, confidence, status, evidence, invalidation_rules, created_by_agent, created_at, updated_at')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(12);

  if (thesesError) throw new Error(`No pude leer tesis de inversión: ${thesesError.message}`);

  const rows = theses || [];
  const assetIds = Array.from(new Set(rows.map((thesis) => thesis.asset_id).filter(Boolean))) as string[];
  const { data: assets, error: assetsError } = assetIds.length > 0
    ? await supabase
        .from('market_assets')
        .select('id, asset_type, symbol, name, exchange, currency, provider, provider_asset_id')
        .in('id', assetIds)
    : { data: [], error: null };

  if (assetsError) throw new Error(`No pude leer activos de tesis: ${assetsError.message}`);

  const assetsById = new Map((assets || []).map((asset) => [asset.id, asset]));

  return rows.map((thesis) => ({
    ...thesis,
    asset: thesis.asset_id ? assetsById.get(thesis.asset_id) || null : null,
  }));
}

async function existingResearchAssetIds({
  supabase,
  profileId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
}) {
  const { data, error } = await supabase
    .from('investment_theses')
    .select('asset_id')
    .eq('profile_id', profileId)
    .eq('created_by_agent', agentKey)
    .in('status', ['active', 'draft']);

  if (error) throw new Error(`No pude leer tesis existentes: ${error.message}`);

  return new Set((data || []).map((thesis) => thesis.asset_id).filter(Boolean));
}

async function getRiskProfile({
  supabase,
  profileId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
}) {
  const { data, error } = await supabase
    .from('advisor_disclosures')
    .select('metadata')
    .eq('profile_id', profileId)
    .eq('disclosure_type', 'risk_profile')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No pude leer perfil de riesgo: ${error.message}`);

  return (data?.metadata || null) as RiskProfile | null;
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

    return NextResponse.json({ success: true, theses: await latestTheses({ supabase, profileId }) });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'investment_research_agent.list', error });
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

    const [riskProfile, snapshots, existingActiveAssets] = await Promise.all([
      getRiskProfile({ supabase, profileId }),
      latestMarketSnapshots(supabase),
      existingResearchAssetIds({ supabase, profileId }),
    ]);
    const candidates = snapshots
      .map((snapshot) => buildThesis(snapshot, riskProfile))
      .filter((thesis): thesis is ThesisPayload => Boolean(thesis))
      .filter((thesis) => !existingActiveAssets.has(thesis.asset_id))
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 6)
      .map((thesis) => ({ ...thesis, profile_id: profileId }));

    const { data: inserted, error: insertError } = candidates.length > 0
      ? await supabase
          .from('investment_theses')
          .insert(candidates)
          .select('id, asset_id, thesis_type, title, summary, stance, horizon, confidence, status, evidence, invalidation_rules, created_by_agent, created_at, updated_at')
      : { data: [], error: null };

    if (tableMissing(insertError)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (insertError) throw new Error(`No pude guardar tesis de inversión: ${insertError.message}`);

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'investment_research_agent.run',
      resourceType: 'workflow',
      resourceId: 'investment_research_agent_v1',
      metadata: {
        snapshots: snapshots.length,
        created: inserted?.length || 0,
        riskProfileConfigured: Boolean(riskProfile),
        policy: 'research_only',
      },
    });

    return NextResponse.json({
      success: true,
      created: inserted?.length || 0,
      skippedExisting: snapshots.length - candidates.length,
      theses: await latestTheses({ supabase, profileId }),
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'investment_research_agent.run', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
