import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
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

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

    return NextResponse.json({
      success: true,
      code: inserted.code,
      expiresAt: inserted.expires_at,
      botUsername,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${encodeURIComponent(inserted.code)}` : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
