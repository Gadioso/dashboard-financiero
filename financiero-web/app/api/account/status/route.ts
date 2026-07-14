import { NextResponse } from 'next/server';
import { getSafeBillingStatus } from '@/lib/billing';
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
  'business_entities',
  'business_members',
  'transaction_splits',
  'agent_tasks',
  'agent_findings',
  'investment_accounts',
  'investment_positions',
  'investment_transactions',
  'investment_theses',
  'paper_trades',
  'trade_intents',
  'risk_limits',
  'advisor_disclosures',
  'cfdi_integrations',
  'cfdi_documents',
  'cfdi_reconciliation_events',
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

type BusinessEntityRow = {
  id: string;
  name: string;
  entity_type: string;
  country?: string | null;
  currency?: string | null;
  status: string;
  created_at?: string | null;
};

type InvestmentAccountRow = {
  id: string;
  provider: string;
  account_name: string;
  account_type: string;
  mode: string;
  status: string;
  base_currency?: string | null;
  business_entity_id?: string | null;
  last_sync_at?: string | null;
  created_at?: string | null;
};

type CfdiDocumentRow = {
  id: string;
  business_entity_id?: string | null;
  cfdi_uuid?: string | null;
  document_direction: string;
  issue_date?: string | null;
  document_type?: string | null;
  status: string;
  issuer_rfc?: string | null;
  issuer_name?: string | null;
  receiver_rfc?: string | null;
  receiver_name?: string | null;
  currency?: string | null;
  total?: number | null;
  created_at?: string | null;
};

type CfdiReconciliationEventRow = {
  id: string;
  cfdi_document_id?: string | null;
  gasto_id?: number | null;
  ingreso_id?: number | null;
  bank_transaction_raw_id?: string | null;
  match_status: string;
  confidence?: number | null;
  amount_delta?: number | null;
  date_delta_days?: number | null;
  evidence?: Record<string, unknown> | null;
  created_at?: string | null;
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

function missingTable(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
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
        businessEntities: [],
        investmentAccounts: [],
        agentTasks: [],
        agentFindings: [],
        cfdiDocuments: [],
        cfdiReconciliationEvents: [],
        financialCounts: Object.fromEntries(scopedTables.map((table) => [table, 0])),
        message: 'DASHBOARD_PRIVATE_PROFILE_ID no está configurado.',
      });
    }

    const [
      profileResult,
      telegramResult,
      gmailResult,
      bankConnectionResult,
      bankAccountResult,
      businessEntitiesResult,
      investmentAccountsResult,
      agentTasksResult,
      agentFindingsResult,
      cfdiDocumentsResult,
      cfdiReconciliationResult,
      personalizationResult,
      billingResult,
      countResults,
    ] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, monthly_income_target, created_at, updated_at').eq('id', profileId).maybeSingle(),
      supabase.from('telegram_accounts').select('id, chat_id, username, first_seen_at, last_seen_at').eq('profile_id', profileId).order('last_seen_at', { ascending: false }),
      supabase.from('gmail_integrations').select('id, email, provider, status, watch_expires_at, updated_at, connected_at, access_token_encrypted, refresh_token_encrypted').eq('profile_id', profileId).order('updated_at', { ascending: false }),
      supabase.from('bank_connections').select('id, provider, institution_name, status, last_sync_at, consent_expires_at, updated_at').eq('profile_id', profileId).order('updated_at', { ascending: false }),
      supabase.from('bank_accounts').select('id, connection_id, name, official_name, type, subtype, currency, current_balance, available_balance, updated_at').eq('profile_id', profileId).order('updated_at', { ascending: false }),
      supabase.from('business_entities').select('id, name, entity_type, country, currency, status, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(12),
      supabase.from('investment_accounts').select('id, business_entity_id, provider, account_name, account_type, mode, status, base_currency, last_sync_at, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(12),
      supabase.from('agent_tasks').select('id, agent_key, title, status, priority, due_at, created_at').eq('profile_id', profileId).in('status', ['open', 'in_progress', 'waiting_user']).order('created_at', { ascending: false }).limit(8),
      supabase.from('agent_findings').select('id, agent_key, finding_type, severity, title, summary, recommendation, status, created_at').eq('profile_id', profileId).eq('status', 'active').order('created_at', { ascending: false }).limit(8),
      supabase.from('cfdi_documents').select('id, business_entity_id, cfdi_uuid, document_direction, issue_date, document_type, status, issuer_rfc, issuer_name, receiver_rfc, receiver_name, currency, total, created_at').eq('profile_id', profileId).order('issue_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(8),
      supabase.from('cfdi_reconciliation_events').select('id, cfdi_document_id, gasto_id, ingreso_id, bank_transaction_raw_id, match_status, confidence, amount_delta, date_delta_days, evidence, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(8),
      supabase.from('financial_personalization_profiles').select('interview_completed_at').eq('profile_id', profileId).maybeSingle(),
      getSafeBillingStatus({ supabase, profileId }),
      Promise.all([...scopedTables, ...optionalScopedTables].map((table) => countProfileRows(supabase, table, profileId))),
    ]);

    const countErrors = countResults
      .filter((result) => result.error && !optionalScopedTables.includes(result.table as (typeof optionalScopedTables)[number]))
      .map((result) => `${result.table}: ${result.error}`);
    const financialCounts = Object.fromEntries(countResults.map((result) => [result.table, result.count]));
    const missingOpenBankingTables = missingTable(bankConnectionResult.error) || missingTable(bankAccountResult.error);
    const missingAgenticTables = [businessEntitiesResult.error, investmentAccountsResult.error, agentTasksResult.error, agentFindingsResult.error].some(missingTable);
    const missingCfdiTables = missingTable(cfdiDocumentsResult.error) || missingTable(cfdiReconciliationResult.error);
    const errors = [
      profileResult.error,
      telegramResult.error,
      gmailResult.error,
      missingOpenBankingTables ? null : bankConnectionResult.error,
      missingOpenBankingTables ? null : bankAccountResult.error,
      missingAgenticTables ? null : businessEntitiesResult.error,
      missingAgenticTables ? null : investmentAccountsResult.error,
      missingAgenticTables ? null : agentTasksResult.error,
      missingAgenticTables ? null : agentFindingsResult.error,
      missingCfdiTables ? null : cfdiDocumentsResult.error,
      missingCfdiTables ? null : cfdiReconciliationResult.error,
      personalizationResult.error,
    ]
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
      bankAccounts: missingOpenBankingTables ? [] : bankAccountResult.data || [],
      businessEntities: missingAgenticTables ? [] : (businessEntitiesResult.data || []) as BusinessEntityRow[],
      investmentAccounts: missingAgenticTables ? [] : (investmentAccountsResult.data || []) as InvestmentAccountRow[],
      agentTasks: missingAgenticTables ? [] : agentTasksResult.data || [],
      agentFindings: missingAgenticTables ? [] : agentFindingsResult.data || [],
      cfdiDocuments: missingCfdiTables ? [] : (cfdiDocumentsResult.data || []) as CfdiDocumentRow[],
      cfdiReconciliationEvents: missingCfdiTables ? [] : (cfdiReconciliationResult.data || []) as CfdiReconciliationEventRow[],
      personalization: {
        completed: Boolean(personalizationResult.data?.interview_completed_at),
        completedAt: personalizationResult.data?.interview_completed_at || null,
      },
      agenticFoundationReady: !missingAgenticTables,
      cfdiFoundationReady: !missingCfdiTables,
      billing: billingResult,
      financialCounts,
      tenantSource: tenant.source,
      errors,
    }, { status: errors.length ? 500 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
