import { NextResponse } from 'next/server';

const authCookieName = 'dashboard_auth';

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set(authCookieName, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
