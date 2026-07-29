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
  'classification_preferences',
  'abonos_tarjeta_credito',
] as const;

const optionalScopedTables = [
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
        telegramBot: {
          name: process.env.TELEGRAM_BOT_DISPLAY_NAME || 'Finance Dashboard',
          username: process.env.TELEGRAM_BOT_USERNAME || null,
        },
        businessEntities: [],
        investmentAccounts: [],
        agentTasks: [],
        agentFindings: [],
        virafiaMessages: [],
        financialCounts: Object.fromEntries(scopedTables.map((table) => [table, 0])),
        message: 'DASHBOARD_PRIVATE_PROFILE_ID no está configurado.',
      });
    }

    const [
      profileResult,
      telegramResult,
      businessEntitiesResult,
      investmentAccountsResult,
      agentTasksResult,
      agentFindingsResult,
      virafiaMessagesResult,
      personalizationResult,
      billingResult,
      countResults,
    ] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, avatar_path, bio, professional_headline, location, website_url, financial_why, monthly_income_target, created_at, updated_at').eq('id', profileId).maybeSingle(),
      supabase.from('telegram_accounts').select('id, chat_id, username, first_seen_at, last_seen_at').eq('profile_id', profileId).order('last_seen_at', { ascending: false }),
      supabase.from('business_entities').select('id, name, entity_type, country, currency, status, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(12),
      supabase.from('investment_accounts').select('id, business_entity_id, provider, account_name, account_type, mode, status, base_currency, last_sync_at, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(12),
      supabase.from('agent_tasks').select('id, agent_key, title, status, priority, due_at, created_at').eq('profile_id', profileId).in('status', ['open', 'in_progress', 'waiting_user']).order('created_at', { ascending: false }).limit(8),
      supabase.from('agent_findings').select('id, agent_key, finding_type, severity, title, summary, recommendation, status, created_at').eq('profile_id', profileId).eq('status', 'active').order('created_at', { ascending: false }).limit(8),
      supabase.from('virafia_conversation_messages').select('id, role, content, channel, metadata, created_at').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(20),
      supabase.from('financial_personalization_profiles').select('interview_completed_at').eq('profile_id', profileId).maybeSingle(),
      getSafeBillingStatus({ supabase, profileId }),
      Promise.all([...scopedTables, ...optionalScopedTables].map((table) => countProfileRows(supabase, table, profileId))),
    ]);

    const countErrors = countResults
      .filter((result) => result.error && !optionalScopedTables.includes(result.table as (typeof optionalScopedTables)[number]))
      .map((result) => `${result.table}: ${result.error}`);
    const financialCounts = Object.fromEntries(countResults.map((result) => [result.table, result.count]));
    const missingAgenticTables = [businessEntitiesResult.error, investmentAccountsResult.error, agentTasksResult.error, agentFindingsResult.error].some(missingTable);
    const errors = [
      profileResult.error,
      telegramResult.error,
      missingAgenticTables ? null : businessEntitiesResult.error,
      missingAgenticTables ? null : investmentAccountsResult.error,
      missingAgenticTables ? null : agentTasksResult.error,
      missingAgenticTables ? null : agentFindingsResult.error,
      missingTable(virafiaMessagesResult.error) ? null : virafiaMessagesResult.error,
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
      profile: profileResult.data ? {
        ...profileResult.data,
        avatarUrl: profileResult.data.avatar_path ? `/api/account/profile/avatar?v=${encodeURIComponent(profileResult.data.updated_at || '')}` : null,
      } : null,
      telegramAccounts: telegramResult.data || [],
      telegramBot: {
        name: process.env.TELEGRAM_BOT_DISPLAY_NAME || 'Finance Dashboard',
        username: process.env.TELEGRAM_BOT_USERNAME || null,
      },
      businessEntities: missingAgenticTables ? [] : (businessEntitiesResult.data || []) as BusinessEntityRow[],
      investmentAccounts: missingAgenticTables ? [] : (investmentAccountsResult.data || []) as InvestmentAccountRow[],
      agentTasks: missingAgenticTables ? [] : agentTasksResult.data || [],
      agentFindings: missingAgenticTables ? [] : agentFindingsResult.data || [],
      virafiaMessages: missingTable(virafiaMessagesResult.error)
        ? []
        : (virafiaMessagesResult.data || []).reverse().map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          channel: message.channel,
          metadata: message.metadata,
          createdAt: message.created_at,
        })),
      personalization: {
        completed: Boolean(personalizationResult.data?.interview_completed_at),
        completedAt: personalizationResult.data?.interview_completed_at || null,
      },
      agenticFoundationReady: !missingAgenticTables,
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
