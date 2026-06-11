import { NextResponse } from 'next/server';
import { clearAuthCookies, getSafeNext, setSupabaseSessionCookies, upsertAuthProfile } from '@/lib/auth-session';
import { getSupabaseAnonClient } from '@/lib/supabase-server';

function redirectToLogin(request: Request, message: string, next: string) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('error', message);
  loginUrl.searchParams.set('next', next);

  const response = NextResponse.redirect(loginUrl);
  clearAuthCookies(response);

  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const safeNext = getSafeNext(requestUrl.searchParams.get('next'));
  const code = requestUrl.searchParams.get('code');
  const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');

  if (oauthError) {
    return redirectToLogin(request, oauthError, safeNext);
  }

  if (!code) {
    return redirectToLogin(request, 'No recibí el código de autenticación.', safeNext);
  }

  const supabase = getSupabaseAnonClient();

  if (!supabase) {
    return redirectToLogin(request, 'Falta configurar Supabase Auth.', safeNext);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session?.access_token || !data.session.refresh_token || !data.user) {
    return redirectToLogin(request, error?.message || 'No pude completar el inicio de sesión.', safeNext);
  }

  await upsertAuthProfile(data.user);

  const response = NextResponse.redirect(new URL(safeNext, request.url));
  clearAuthCookies(response);
  setSupabaseSessionCookies(response, data.session.access_token, data.session.refresh_token);

  return response;
}
