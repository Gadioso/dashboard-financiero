import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext, normalizeProfileId } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const providers = new Set(['manual', 'binance', 'polymarket', 'gbm', 'cetesdirecto', 'fintual', 'kuspit', 'wallet', 'other']);
const accountTypes = new Set(['brokerage', 'crypto_exchange', 'wallet', 'cetes', 'prediction_market', 'manual', 'other']);
const modes = new Set(['manual', 'read_only', 'paper', 'staged', 'live_disabled']);
const statuses = new Set(['pending', 'active', 'paused', 'revoked', 'error']);

function cleanText(value: unknown, maxLength: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanCode(value: unknown, fallback: string, maxLength = 12) {
  const cleaned = cleanText(value, maxLength)?.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

  return cleaned || fallback;
}

function cleanUuid(value: unknown) {
  return normalizeProfileId(typeof value === 'string' ? value : null);
}

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
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

    const { data, error } = await supabase
      .from('investment_accounts')
      .select('id, business_entity_id, provider, account_name, account_type, mode, status, base_currency, external_account_id, permissions, last_sync_at, error_message, metadata, created_at, updated_at')
      .eq('profile_id', tenant.profileId)
      .order('created_at', { ascending: false });

    if (tableMissing(error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (error) {
      throw new Error(`No pude leer cuentas de inversión: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      profileScoped: true,
      investmentAccounts: data || [],
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, action: 'investments.accounts.list', error });
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
    const provider = cleanText(body.provider, 40) || 'manual';
    const accountName = cleanText(body.accountName ?? body.account_name, 120);
    const accountType = cleanText(body.accountType ?? body.account_type, 40) || (provider === 'binance' ? 'crypto_exchange' : provider === 'polymarket' ? 'prediction_market' : 'manual');
    const mode = cleanText(body.mode, 40) || (provider === 'manual' ? 'manual' : 'read_only');
    const status = cleanText(body.status, 30) || 'active';
    const businessEntityId = cleanUuid(body.businessEntityId ?? body.business_entity_id);

    if (!accountName) {
      return NextResponse.json({ success: false, error: 'El nombre de la cuenta es obligatorio.' }, { status: 400 });
    }

    if (!providers.has(provider)) {
      return NextResponse.json({ success: false, error: 'Proveedor de inversión inválido.' }, { status: 400 });
    }

    if (!accountTypes.has(accountType)) {
      return NextResponse.json({ success: false, error: 'Tipo de cuenta inválido.' }, { status: 400 });
    }

    if (!modes.has(mode)) {
      return NextResponse.json({ success: false, error: 'Modo de cuenta inválido.' }, { status: 400 });
    }

    if (!statuses.has(status)) {
      return NextResponse.json({ success: false, error: 'Estado inválido.' }, { status: 400 });
    }

    if (mode === 'staged' || mode === 'live_disabled') {
      return NextResponse.json({
        success: false,
        error: 'Este primer corte solo permite cuentas manuales, read-only o paper.',
      }, { status: 400 });
    }

    if (businessEntityId) {
      const { data: businessEntity, error: businessError } = await supabase
        .from('business_entities')
        .select('id')
        .eq('id', businessEntityId)
        .eq('profile_id', profileId)
        .maybeSingle();

      if (tableMissing(businessError)) {
        return NextResponse.json({
          success: false,
          error: 'Falta aplicar la migración agentic foundation.',
          migration: '20260630_agentic_business_wealth_foundation.sql',
        }, { status: 409 });
      }

      if (businessError) {
        throw new Error(`No pude validar la entidad de negocio: ${businessError.message}`);
      }

      if (!businessEntity) {
        return NextResponse.json({ success: false, error: 'La entidad de negocio no pertenece al perfil actual.' }, { status: 404 });
      }
    }

    const payload = {
      profile_id: profileId,
      business_entity_id: businessEntityId,
      provider,
      account_name: accountName,
      account_type: accountType,
      mode,
      status,
      base_currency: cleanCode(body.baseCurrency ?? body.base_currency, 'MXN', 3),
      external_account_id: cleanText(body.externalAccountId ?? body.external_account_id, 160),
      permissions: typeof body.permissions === 'object' && body.permissions !== null ? body.permissions : {},
      metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('investment_accounts')
      .insert([payload])
      .select('id, business_entity_id, provider, account_name, account_type, mode, status, base_currency, external_account_id, permissions, last_sync_at, error_message, metadata, created_at, updated_at')
      .single();

    if (tableMissing(error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (error) {
      throw new Error(`No pude crear cuenta de inversión: ${error.message}`);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'investments.accounts.create',
      resourceType: 'investment_account',
      resourceId: data.id,
      metadata: {
        provider,
        accountType,
        mode,
        businessEntityId,
      },
    });

    return NextResponse.json({ success: true, investmentAccount: data }, { status: 201 });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'investments.accounts.create', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
