import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    const profileId = tenant.profileId;
    const body = await request.json().catch(() => ({})) as {
      email?: string;
      status?: 'active' | 'paused' | 'revoked' | 'error';
    };
    const email = normalizeEmail(body.email);
    const status = body.status || 'active';

    if (!email) {
      return NextResponse.json({ success: false, error: 'Falta un email válido.' }, { status: 400 });
    }

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No pude resolver el perfil autenticado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('gmail_integrations')
      .upsert(
        {
          profile_id: profileId,
          email,
          provider: 'gmail',
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,email' }
      )
      .select('id, profile_id, email, provider, status, watch_expires_at, updated_at')
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
