import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const scopedTables = [
  'gastos',
  'ingresos',
  'presupuestos_mensuales',
  'fondos_acumulados',
  'telegram_memoria',
  'santander_ingest_logs',
  'classification_preferences',
  'abonos_tarjeta_credito',
] as const;

const optionalScopedTables = [
  'bank_connections',
  'bank_accounts',
  'bank_transactions_raw',
  'bank_sync_runs',
] as const;

async function countProfileRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  table: (typeof scopedTables)[number] | (typeof optionalScopedTables)[number],
  profileId: string
) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);

  return {
    table,
    count: count || 0,
    error: error?.message || null,
  };
}

type BankConnectionRow = {
  id: string;
  provider: string;
  institution_name?: string | null;
  status: string;
  last_sync_at?: string | null;
  consent_expires_at?: string | null;
  updated_at?: string | null;
};

function dedupeBankConnections(connections: BankConnectionRow[]) {
  const seen = new Set<string>();

  return connections.filter((connection) => {
    const key = [
      connection.provider,
      connection.institution_name?.trim().toLowerCase() || connection.id,
      connection.status,
    ].join(':');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    const profileId = tenant.profileId;

    if (!profileId) {
      return NextResponse.json({
        success: true,
        configured: false,
        profileScoped: false,
        profileId: null,
        profile: null,
        telegramAccounts: [],
        gmailIntegrations: [],
        financialCounts: Object.fromEntries(scopedTables.map((table) => [table, 0])),
        message: 'DASHBOARD_PRIVATE_PROFILE_ID no está configurado.',
      });
    }

    const [profileResult, telegramResult, gmailResult, bankConnectionResult, countResults] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, monthly_income_target, created_at, updated_at').eq('id', profileId).maybeSingle(),
      supabase.from('telegram_accounts').select('id, chat_id, username, first_seen_at, last_seen_at').eq('profile_id', profileId).order('last_seen_at', { ascending: false }),
      supabase.from('gmail_integrations').select('id, email, provider, status, watch_expires_at, updated_at, connected_at, access_token_encrypted, refresh_token_encrypted').eq('profile_id', profileId).order('updated_at', { ascending: false }),
      supabase.from('bank_connections').select('id, provider, institution_name, status, last_sync_at, consent_expires_at, updated_at').eq('profile_id', profileId).order('updated_at', { ascending: false }),
      Promise.all([...scopedTables, ...optionalScopedTables].map((table) => countProfileRows(supabase, table, profileId))),
    ]);

    const countErrors = countResults
      .filter((result) => result.error && !optionalScopedTables.includes(result.table as (typeof optionalScopedTables)[number]))
      .map((result) => `${result.table}: ${result.error}`);
    const financialCounts = Object.fromEntries(countResults.map((result) => [result.table, result.count]));
    const missingOpenBankingTables = bankConnectionResult.error?.code === '42P01';
    const errors = [profileResult.error, telegramResult.error, gmailResult.error, missingOpenBankingTables ? null : bankConnectionResult.error]
      .filter(Boolean)
      .map((error) => error?.message)
      .concat(countErrors);

    return NextResponse.json({
      success: errors.length === 0,
      configured: true,
      profileScoped: errors.length === 0 && profileResult.data?.id === profileId,
      profileId,
      profile: profileResult.data || null,
      telegramAccounts: telegramResult.data || [],
      gmailIntegrations: (gmailResult.data || []).map((integration) => ({
        id: integration.id,
        email: integration.email,
        provider: integration.provider,
        status: integration.status,
        watch_expires_at: integration.watch_expires_at,
        updated_at: integration.updated_at,
        connected_at: integration.connected_at,
        oauthConnected: Boolean(integration.access_token_encrypted && integration.refresh_token_encrypted),
      })),
      bankConnections: missingOpenBankingTables ? [] : dedupeBankConnections(bankConnectionResult.data || []),
      financialCounts,
      tenantSource: tenant.source,
      errors,
    }, { status: errors.length ? 500 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
