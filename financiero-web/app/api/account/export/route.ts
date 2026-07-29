import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const exportTables = [
  { key: 'profile', table: 'profiles', select: 'id, email, full_name, monthly_income_target, created_at, updated_at', single: true },
  { key: 'gastos', table: 'gastos', select: '*' },
  { key: 'ingresos', table: 'ingresos', select: '*' },
  { key: 'presupuestos_mensuales', table: 'presupuestos_mensuales', select: '*' },
  { key: 'fondos_acumulados', table: 'fondos_acumulados', select: '*' },
  { key: 'abonos_tarjeta_credito', table: 'abonos_tarjeta_credito', select: '*' },
  { key: 'classification_preferences', table: 'classification_preferences', select: '*' },
  { key: 'telegram_accounts', table: 'telegram_accounts', select: 'id, profile_id, chat_id, username, first_seen_at, last_seen_at' },
  { key: 'telegram_memoria', table: 'telegram_memoria', select: '*' },
  { key: 'billing_customers', table: 'billing_customers', select: 'profile_id, stripe_customer_id, email, created_at, updated_at', single: true },
  { key: 'billing_subscriptions', table: 'billing_subscriptions', select: '*' },
  { key: 'audit_events', table: 'audit_events', select: 'id, profile_id, action, resource_type, resource_id, request_method, request_path, metadata, created_at' },
  { key: 'error_events', table: 'error_events', select: 'id, profile_id, action, request_method, request_path, message, code, severity, metadata, alerted_at, resolved_at, created_at' },
] as const;

function missingOptionalTable(error: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /does not exist|schema cache|Could not find/i.test(error?.message || '');
}

export async function GET(request: Request) {
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

    const exportData: Record<string, unknown> = {};
    const warnings: string[] = [];

    for (const item of exportTables) {
      if (item.table === 'profiles') {
        const result = await supabase.from('profiles').select(item.select).eq('id', profileId).maybeSingle();

        if (result.error) {
          throw new Error(`${item.table}: ${result.error.message}`);
        }

        exportData[item.key] = result.data || null;
        continue;
      }

      const query = supabase.from(item.table).select(item.select).eq('profile_id', profileId);
      const result = 'single' in item && item.single ? await query.maybeSingle() : await query;

      if (result.error) {
        if (missingOptionalTable(result.error)) {
          exportData[item.key] = 'single' in item && item.single ? null : [];
          warnings.push(`${item.table}: ${result.error.message}`);
          continue;
        }

        throw new Error(`${item.table}: ${result.error.message}`);
      }

      exportData[item.key] = result.data || ('single' in item && item.single ? null : []);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'account.export',
      resourceType: 'profile',
      resourceId: profileId,
      metadata: { tables: exportTables.map((table) => table.table), warnings },
    });

    return NextResponse.json({
      success: true,
      exportedAt: new Date().toISOString(),
      profileId,
      warnings,
      data: exportData,
    });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'account.export',
      error,
    });
    const message = error instanceof Error ? error.message : 'No pude exportar tus datos.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
