import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getPrivateProfileId } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const profileId = getPrivateProfileId();

    if (!profileId) {
      return NextResponse.json({
        success: true,
        configured: false,
        profileId: null,
        profile: null,
        telegramAccounts: [],
        gmailIntegrations: [],
        message: 'DASHBOARD_PRIVATE_PROFILE_ID no está configurado.',
      });
    }

    const [profileResult, telegramResult, gmailResult] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, monthly_income_target, created_at, updated_at').eq('id', profileId).maybeSingle(),
      supabase.from('telegram_accounts').select('id, chat_id, username, first_seen_at, last_seen_at').eq('profile_id', profileId).order('last_seen_at', { ascending: false }),
      supabase.from('gmail_integrations').select('id, email, provider, status, watch_expires_at, updated_at').eq('profile_id', profileId).order('updated_at', { ascending: false }),
    ]);

    const errors = [profileResult.error, telegramResult.error, gmailResult.error]
      .filter(Boolean)
      .map((error) => error?.message);

    return NextResponse.json({
      success: errors.length === 0,
      configured: true,
      profileId,
      profile: profileResult.data || null,
      telegramAccounts: telegramResult.data || [],
      gmailIntegrations: gmailResult.data || [],
      errors,
    }, { status: errors.length ? 500 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
