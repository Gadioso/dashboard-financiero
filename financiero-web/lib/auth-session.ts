import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const authCookieName = 'dashboard_auth';
export const accessCookieName = 'sb_access_token';
export const refreshCookieName = 'sb_refresh_token';

export function getRequestCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export function getSafeNext(value?: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

export function getAppOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredAppUrl) return requestOrigin;

  try {
    const configuredUrl = new URL(configuredAppUrl);

    return configuredUrl.protocol === 'https:' || configuredUrl.protocol === 'http:'
      ? configuredUrl.origin
      : requestOrigin;
  } catch {
    return requestOrigin;
  }
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function setSupabaseSessionCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  const cookieOptions = getSessionCookieOptions();

  response.cookies.set(accessCookieName, accessToken, cookieOptions);
  response.cookies.set(refreshCookieName, refreshToken, cookieOptions);
}

export function clearAuthCookies(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };

  response.cookies.set(authCookieName, '', cookieOptions);
  response.cookies.set(accessCookieName, '', cookieOptions);
  response.cookies.set(refreshCookieName, '', cookieOptions);
}

export async function upsertAuthProfile(user: User, fallbackEmail?: string | null) {
  const service = getSupabaseServiceClient();

  if (!service) return;

  const metadata = user.user_metadata || {};
  const fullName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null;
  const countryCode = metadata.country_code === 'US' ? 'US' : metadata.country_code === 'MX' ? 'MX' : null;
  const locale = metadata.locale === 'en-US' ? 'en-US' : metadata.locale === 'es-MX' ? 'es-MX' : null;

  const { error } = await service.from('profiles').upsert(
    {
      id: user.id,
      email: user.email || fallbackEmail || null,
      full_name: fullName,
      ...(countryCode ? { country_code: countryCode } : {}),
      ...(locale ? { locale } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(`No pude crear o actualizar el perfil de autenticacion: ${error.message}`);
  }
}

export async function getPostAuthNext(userId: string, requestedNext?: string | null) {
  const safeNext = getSafeNext(requestedNext);
  const service = getSupabaseServiceClient();

  if (!service) return safeNext;

  const { data, error } = await service
    .from('financial_personalization_profiles')
    .select('profile_id')
    .eq('profile_id', userId)
    .maybeSingle();

  if (error) return safeNext;

  return data?.profile_id ? safeNext : '/onboarding?focus=goals';
}
