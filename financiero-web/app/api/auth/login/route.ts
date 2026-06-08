import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const authCookieName = 'dashboard_auth';

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

  const expectedToken = process.env.DASHBOARD_ACCESS_TOKEN || '';

  if (!expectedToken) {
    return NextResponse.json(
      { success: false, error: 'Falta configurar DASHBOARD_ACCESS_TOKEN.' },
      { status: 500 }
    );
  }

  const { token, next } = (await request.json().catch(() => ({}))) as {
    token?: string;
    next?: string;
  };

  if (!token || token !== expectedToken) {
    return NextResponse.json({ success: false, error: 'Token incorrecto.' }, { status: 401 });
  }

  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  const response = NextResponse.json({ success: true, next: safeNext });

  response.cookies.set(authCookieName, expectedToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
