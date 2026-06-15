import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { assertBillingLimit, BillingLimitError } from '@/lib/billing';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function createCode() {
  return `DF-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { count, error: countError } = await supabase
      .from('telegram_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', tenant.profileId);

    if (countError) {
      return NextResponse.json({ success: false, error: countError.message }, { status: 500 });
    }

    await assertBillingLimit({
      supabase,
      profileId: tenant.profileId,
      resource: 'telegramAccounts',
      currentCount: count || 0,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    let code = createCode();
    let inserted = null;
    let lastError = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabase
        .from('telegram_link_codes')
        .insert({
          code,
          profile_id: tenant.profileId,
          expires_at: expiresAt,
        })
        .select('code, expires_at, status')
        .single();

      if (!error) {
        inserted = data;
        break;
      }

      lastError = error;
      code = createCode();
    }

    if (!inserted) {
      return NextResponse.json({ success: false, error: lastError?.message || 'No pude crear el código.' }, { status: 500 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'telegram.link_code.created',
      resourceType: 'telegram_link_codes',
      metadata: { expiresAt: inserted.expires_at },
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

    return NextResponse.json({
      success: true,
      code: inserted.code,
      expiresAt: inserted.expires_at,
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(inserted.code)}` : null,
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'telegram.link_code.create',
      error,
      severity: error instanceof BillingLimitError ? 'warning' : 'error',
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    const status = error instanceof BillingLimitError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
