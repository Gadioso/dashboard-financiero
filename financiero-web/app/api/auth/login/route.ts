import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSupabaseAnonClient, getSupabaseServiceClient } from '@/lib/supabase-server';

const authCookieName = 'dashboard_auth';
const accessCookieName = 'sb_access_token';
const refreshCookieName = 'sb_refresh_token';

function setSessionCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };

  response.cookies.set(accessCookieName, accessToken, cookieOptions);
  response.cookies.set(refreshCookieName, refreshToken, cookieOptions);
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    key: `auth-login:${ip}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
      { status: 429 }
    );
  }

  const { token, email, password, next } = (await request.json().catch(() => ({}))) as {
    token?: string;
    email?: string;
    password?: string;
    next?: string;
  };
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  const expectedToken = process.env.DASHBOARD_ACCESS_TOKEN || '';

  if (token || (!email && !password)) {
    if (!expectedToken) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar DASHBOARD_ACCESS_TOKEN.' },
        { status: 500 }
      );
    }

    if (!token || token !== expectedToken) {
      return NextResponse.json({ success: false, error: 'Token incorrecto.' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true, next: safeNext, mode: 'private-token' });

    response.cookies.set(authCookieName, expectedToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  }

  const supabase = getSupabaseAnonClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Falta configurar Supabase Auth.' }, { status: 500 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
  });

  if (error || !data.session?.access_token || !data.session.refresh_token || !data.user) {
    return NextResponse.json({ success: false, error: error?.message || 'No pude iniciar sesión.' }, { status: 401 });
  }

  const service = getSupabaseServiceClient();

  if (service) {
    await service.from('profiles').upsert(
      {
        id: data.user.id,
        email: data.user.email || String(email || '').trim().toLowerCase(),
        full_name: data.user.user_metadata?.full_name || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  }

  const response = NextResponse.json({ success: true, next: safeNext, mode: 'supabase-auth' });
  setSessionCookies(response, data.session.access_token, data.session.refresh_token);

  return response;
}
