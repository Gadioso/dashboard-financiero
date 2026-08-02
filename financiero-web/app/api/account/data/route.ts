import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth-session';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const confirmationPhrase = 'BORRAR MIS DATOS';

const dataTables = [
  'financial_goal_contributions',
  'billing_credit_ledger',
  'santander_ingest_logs',
  'market_data_snapshots',
  'financial_import_rows',
  'financial_import_batches',
  'virafia_conversation_messages',
  'daily_cfo_deliveries',
  'daily_cfo_briefings',
  'daily_cfo_preferences',
  'movement_notification_deliveries',
  'transaction_splits',
  'investment_transactions',
  'investment_positions',
  'investment_theses',
  'trade_intents',
  'paper_trades',
  'risk_limits',
  'agent_findings',
  'agent_tasks',
  'advisor_disclosures',
  'business_members',
  'business_entities',
  'financial_goals',
  'financial_personalization_profiles',
  'fiscal_alerts',
  'fiscal_compliance_opinions',
  'fiscal_declaration_drafts',
  'fiscal_operations',
  'fiscal_provider_documents',
  'fiscal_integrations',
  'fiscal_profiles',
  'cfdi_reconciliation_events',
  'cfdi_documents',
  'cfdi_integrations',
  'bank_transactions_raw',
  'bank_sync_runs',
  'bank_accounts',
  'bank_connections',
  'syncfy_users',
  'gmail_integrations',
  'telegram_link_codes',
  'abonos_tarjeta_credito',
  'gastos',
  'ingresos',
  'presupuestos_mensuales',
  'fondos_acumulados',
  'classification_preferences',
  'telegram_memoria',
  'telegram_accounts',
  'billing_subscriptions',
  'billing_customers',
  'audit_events',
  'error_events',
] as const;

function canIgnoreDeleteError(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || error?.code === '42703' || /does not exist|schema cache|Could not find/i.test(error?.message || '');
}

async function deleteProfileRows({
  supabase,
  table,
  profileId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  table: string;
  profileId: string;
}) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('profile_id', profileId);

  if (error && !canIgnoreDeleteError(error)) {
    throw new Error(`${table}: ${error.message}`);
  }

  return count || 0;
}

async function deleteProfileStorage(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>, bucket: string, profileId: string) {
  const { data: objects, error: listError } = await supabase.storage.from(bucket).list(profileId, { limit: 1000 });
  if (listError) return;
  const paths = (objects || []).filter((object) => object.name).map((object) => `${profileId}/${object.name}`);
  if (paths.length) await supabase.storage.from(bucket).remove(paths);
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseServiceClient();
  let profileId: string | null = null;
  let actorEmail: string | null = null;

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId || null;
    actorEmail = tenant.email || null;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      confirmation?: string;
      deleteAuthUser?: boolean;
    };

    if (body.confirmation !== confirmationPhrase) {
      return NextResponse.json({
        success: false,
        error: `Para borrar datos envía confirmation="${confirmationPhrase}".`,
      }, { status: 400 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'account.delete_data.requested',
      resourceType: 'profile',
      resourceId: profileId,
      metadata: { deleteAuthUser: Boolean(body.deleteAuthUser) },
    });

    const deleted: Record<string, number> = {};

    await Promise.all([
      deleteProfileStorage(supabase, 'profile-avatars', profileId),
      deleteProfileStorage(supabase, 'financial-imports', profileId),
    ]);

    for (const table of dataTables) {
      deleted[table] = await deleteProfileRows({ supabase, table, profileId });
    }

    const profileDelete = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', profileId);

    if (profileDelete.error && !canIgnoreDeleteError(profileDelete.error)) {
      throw new Error(`profiles: ${profileDelete.error.message}`);
    }

    deleted.profiles = profileDelete.count || 0;

    let authUserDeleted = false;

    if (body.deleteAuthUser) {
      const { error } = await supabase.auth.admin.deleteUser(profileId);

      if (error) {
        throw new Error(`auth.users: ${error.message}`);
      }

      authUserDeleted = true;
    }

    const response = NextResponse.json({
      success: true,
      deleted,
      authUserDeleted,
    });
    clearAuthCookies(response);

    return response;
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'account.delete_data',
      error,
      severity: 'critical',
    });
    const message = error instanceof Error ? error.message : 'No pude borrar los datos.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
