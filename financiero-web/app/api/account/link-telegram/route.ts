import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    const profileId = tenant.profileId;
    const body = await request.json().catch(() => ({})) as {
      chatId?: string | number;
      username?: string;
    };
    const chatId = String(body.chatId || '').trim();
    const username = String(body.username || '').trim() || null;

    if (!chatId) {
      return NextResponse.json({ success: false, error: 'Falta chatId.' }, { status: 400 });
    }

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No pude resolver el perfil autenticado.' }, { status: 401 });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('telegram_accounts')
      .upsert(
        {
          profile_id: profileId,
          chat_id: chatId,
          username,
          last_seen_at: now,
        },
        { onConflict: 'chat_id' }
      )
      .select('id, profile_id, chat_id, username, first_seen_at, last_seen_at')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
