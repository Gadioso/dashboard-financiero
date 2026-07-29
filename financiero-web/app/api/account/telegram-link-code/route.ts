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

function isTelegramLinkCode(value: string) {
  return /^DF-[A-F0-9]{8}$/i.test(value);
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

    const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase() || '';

    if (!isTelegramLinkCode(code)) {
      return NextResponse.json({ success: false, error: 'Código inválido.' }, { status: 400 });
    }

    const { data: linkCode, error } = await supabase
      .from('telegram_link_codes')
      .select('status, claimed_chat_id, expires_at')
      .eq('code', code)
      .eq('profile_id', tenant.profileId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!linkCode) {
      return NextResponse.json({ success: false, error: 'No encontré ese código.' }, { status: 404 });
    }

    let status = linkCode.status as 'pending' | 'claimed' | 'expired';

    if (status === 'pending' && new Date(linkCode.expires_at).getTime() < Date.now()) {
      status = 'expired';
      await supabase
        .from('telegram_link_codes')
        .update({ status: 'expired' })
        .eq('code', code)
        .eq('profile_id', tenant.profileId)
        .eq('status', 'pending');
    }

    let telegramAccount = null;

    if (status === 'claimed' && linkCode.claimed_chat_id) {
      const accountResult = await supabase
        .from('telegram_accounts')
        .select('id, username, first_seen_at, last_seen_at')
        .eq('profile_id', tenant.profileId)
        .eq('chat_id', linkCode.claimed_chat_id)
        .maybeSingle();

      if (accountResult.error) {
        return NextResponse.json({ success: false, error: accountResult.error.message }, { status: 500 });
      }

      telegramAccount = accountResult.data;
    }

    return NextResponse.json({
      success: true,
      status,
      connected: status === 'claimed' && Boolean(telegramAccount),
      telegramAccount,
      expiresAt: linkCode.expires_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
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

    const { error: expireError } = await supabase
      .from('telegram_link_codes')
      .update({ status: 'expired' })
      .eq('profile_id', tenant.profileId)
      .eq('status', 'pending');

    if (expireError) {
      return NextResponse.json({ success: false, error: expireError.message }, { status: 500 });
    }

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
    const botName = process.env.TELEGRAM_BOT_DISPLAY_NAME || 'Virafi';

    return NextResponse.json({
      success: true,
      code: inserted.code,
      expiresAt: inserted.expires_at,
      botName,
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
