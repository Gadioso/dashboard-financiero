import { NextResponse } from 'next/server';
import { clearAuthCookies, getSafeNext, setSupabaseSessionCookies, upsertAuthProfile } from '@/lib/auth-session';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSupabaseAnonClient, getSupabaseServiceClient } from '@/lib/supabase-server';

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function POST(request: Request) {
  const serviceSupabase = getSupabaseServiceClient();
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({
    key: `auth-signup:${ip}`,
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
      { status: 429 }
    );
  }

  const supabase = getSupabaseAnonClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Falta configurar Supabase Auth.' }, { status: 500 });
  }

  const { email: rawEmail, password, fullName, next, countryCode } = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    fullName?: string;
    next?: string;
    countryCode?: string;
  };
  const email = normalizeEmail(rawEmail);

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { success: false, error: 'Necesitas un email válido y una contraseña de al menos 8 caracteres.' },
      { status: 400 }
    );
  }

  const normalizedCountryCode = countryCode === 'US' ? 'US' : 'MX';
  const locale = normalizedCountryCode === 'US' ? 'en-US' : 'es-MX';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/auth/callback?next=${encodeURIComponent('/onboarding?focus=goals')}`,
      data: {
        full_name: fullName?.trim() || null,
        country_code: normalizedCountryCode,
        locale,
      },
    },
  });

  if (error) {
    await logErrorEvent({
      supabase: serviceSupabase,
      request,
      actorEmail: email,
      action: 'auth.signup',
      error,
      code: 'auth_signup_failed',
      severity: 'warning',
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;

  if (data.user && userId) {
    await upsertAuthProfile(data.user, email);
  }

  const safeNext = getSafeNext(next);
  const postSignupNext = '/onboarding?focus=goals';
  const response = NextResponse.json({
    success: true,
    next: postSignupNext,
    needsEmailConfirmation: !data.session,
    message: data.session
      ? 'Cuenta creada. Ya puedes entrar.'
      : 'Cuenta creada. Revisa tu correo para confirmar el acceso.',
  });

  if (data.session?.access_token && data.session.refresh_token) {
    clearAuthCookies(response);
    setSupabaseSessionCookies(response, data.session.access_token, data.session.refresh_token);
  }

  await logAuditEvent({
    supabase: serviceSupabase,
    request,
    profileId: userId || null,
    actorEmail: email,
    action: 'auth.signup',
    resourceType: 'profile',
    resourceId: userId || null,
    metadata: { needsEmailConfirmation: !data.session, requestedNext: safeNext, next: postSignupNext },
  });

  return response;
}
