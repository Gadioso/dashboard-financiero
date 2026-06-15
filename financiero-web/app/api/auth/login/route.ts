import { NextResponse } from 'next/server';
import { authCookieName, clearAuthCookies, getSafeNext, setSupabaseSessionCookies, upsertAuthProfile } from '@/lib/auth-session';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSupabaseAnonClient, getSupabaseServiceClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const serviceSupabase = getSupabaseServiceClient();
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
  const safeNext = getSafeNext(next);
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

    clearAuthCookies(response);
    response.cookies.set(authCookieName, expectedToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    await logAuditEvent({
      supabase: serviceSupabase,
      request,
      action: 'auth.login',
      resourceType: 'auth',
      metadata: { mode: 'private-token' },
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
    await logErrorEvent({
      supabase: serviceSupabase,
      request,
      actorEmail: String(email || '').trim().toLowerCase(),
      action: 'auth.login',
      error: error || new Error('No pude iniciar sesión.'),
      code: 'auth_login_failed',
      severity: 'warning',
    });
    return NextResponse.json({ success: false, error: error?.message || 'No pude iniciar sesión.' }, { status: 401 });
  }

  await upsertAuthProfile(data.user, String(email || '').trim().toLowerCase());

  const response = NextResponse.json({ success: true, next: safeNext, mode: 'supabase-auth' });
  clearAuthCookies(response);
  setSupabaseSessionCookies(response, data.session.access_token, data.session.refresh_token);

  await logAuditEvent({
    supabase: serviceSupabase,
    request,
    profileId: data.user.id,
    actorEmail: data.user.email || String(email || '').trim().toLowerCase(),
    action: 'auth.login',
    resourceType: 'profile',
    resourceId: data.user.id,
    metadata: { mode: 'supabase-auth' },
  });

  return response;
}
