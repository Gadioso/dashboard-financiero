import { NextResponse } from 'next/server';

const authCookieName = 'dashboard_auth';
const accessCookieName = 'sb_access_token';
const refreshCookieName = 'sb_refresh_token';

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set(authCookieName, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(accessCookieName, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(refreshCookieName, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
