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

async function deleteProfileStorage(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>, bucket: string, profileId: string) {
  const storage = supabase.storage.from(bucket);
  const paths: string[] = [];
  const walk = async (prefix: string) => {
    for (let offset = 0; ; offset += 1_000) {
      const { data, error } = await storage.list(prefix, { limit: 1_000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error(`${bucket}: no pude listar ${prefix}: ${error.message}`);
      for (const object of data || []) {
        const path = `${prefix}/${object.name}`;
        if (object.id === null) await walk(path);
        else paths.push(path);
      }
      if (!data || data.length < 1_000) break;
    }
  };

  await walk(profileId);
  for (let index = 0; index < paths.length; index += 1_000) {
    const { error } = await storage.remove(paths.slice(index, index + 1_000));
    if (error) throw new Error(`${bucket}: no pude borrar archivos: ${error.message}`);
  }
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

    // The database mutation is a single transaction. Storage is intentionally
    // completed first because it cannot participate in a Postgres transaction.
    const { data: purgeResult, error: purgeError } = await supabase.rpc('purge_profile_data', {
      p_profile_id: profileId,
      p_tables: [...dataTables],
    });
    if (purgeError) throw new Error(`No pude borrar los datos de cuenta: ${purgeError.message}`);
    Object.assign(deleted, (purgeResult as Record<string, number> | null) || {});

    let authUserDeleted = false;

    if (body.deleteAuthUser) {
      const { error: signOutError } = await supabase.auth.admin.signOut(profileId, 'global');
      if (signOutError) throw new Error(`auth.sessions: ${signOutError.message}`);
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
