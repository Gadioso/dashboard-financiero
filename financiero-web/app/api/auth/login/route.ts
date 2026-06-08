import { NextResponse } from 'next/server';

const authCookieName = 'dashboard_auth';

export async function POST(request: Request) {
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
