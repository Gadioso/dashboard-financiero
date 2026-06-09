import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSupabaseAnonClient, getSupabaseServiceClient } from '@/lib/supabase-server';

const accessCookieName = 'sb_access_token';
const refreshCookieName = 'sb_refresh_token';

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

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

  const { email: rawEmail, password, fullName, next } = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    fullName?: string;
    next?: string;
  };
  const email = normalizeEmail(rawEmail);

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { success: false, error: 'Necesitas un email válido y una contraseña de al menos 8 caracteres.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName?.trim() || null,
      },
    },
  });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  const service = getSupabaseServiceClient();
  const userId = data.user?.id;

  if (service && userId) {
    await service.from('profiles').upsert(
      {
        id: userId,
        email,
        full_name: fullName?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  }

  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  const response = NextResponse.json({
    success: true,
    next: safeNext,
    needsEmailConfirmation: !data.session,
    message: data.session
      ? 'Cuenta creada. Ya puedes entrar.'
      : 'Cuenta creada. Revisa tu correo para confirmar el acceso.',
  });

  if (data.session?.access_token && data.session.refresh_token) {
    setSessionCookies(response, data.session.access_token, data.session.refresh_token);
  }

  return response;
}
