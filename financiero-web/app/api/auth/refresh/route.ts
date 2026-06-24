import { NextResponse } from 'next/server';
import {
  authCookieName,
  clearAuthCookies,
  getRequestCookie,
  refreshCookieName,
  setSupabaseSessionCookies,
  upsertAuthProfile,
} from '@/lib/auth-session';
import { getSupabaseAnonClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const expectedPrivateToken = process.env.DASHBOARD_ACCESS_TOKEN || '';
  const privateToken = getRequestCookie(request, authCookieName);

  if (expectedPrivateToken && privateToken === expectedPrivateToken) {
    return NextResponse.json({ success: true, mode: 'private-token' });
  }

  const refreshToken = getRequestCookie(request, refreshCookieName);
  if (!refreshToken) {
    const response = NextResponse.json({ success: false, error: 'La sesión expiró.' }, { status: 401 });
    clearAuthCookies(response);

    return response;
  }

  const supabase = getSupabaseAnonClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Falta configurar Supabase Auth.' }, { status: 500 });
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token || !data.user) {
    const response = NextResponse.json({ success: false, error: error?.message || 'No pude renovar la sesión.' }, { status: 401 });
    clearAuthCookies(response);

    return response;
  }

  await upsertAuthProfile(data.user);

  const response = NextResponse.json({ success: true, mode: 'supabase-auth' });
  setSupabaseSessionCookies(response, data.session.access_token, data.session.refresh_token);

  return response;
}
