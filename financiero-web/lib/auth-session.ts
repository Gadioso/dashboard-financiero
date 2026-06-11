import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const authCookieName = 'dashboard_auth';
export const accessCookieName = 'sb_access_token';
export const refreshCookieName = 'sb_refresh_token';

export function getSafeNext(value?: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
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
    sameSite: 'strict' as const,
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

  const { error } = await service.from('profiles').upsert(
    {
      id: user.id,
      email: user.email || fallbackEmail || null,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(`No pude crear o actualizar el perfil de autenticacion: ${error.message}`);
  }
}
