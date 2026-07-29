import { createClient } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const oauthStorageKey = 'dashboard-oauth';
const oauthVerifierStorageKey = `${oauthStorageKey}-code-verifier`;
const oauthVerifierCookieName = 'dashboard_oauth_code_verifier';

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function getOAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function getSupabaseServiceClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAnonClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseOAuthClient(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  let verifier = getCookieValue(request, oauthVerifierCookieName);
  let verifierChanged = false;

  const storage = {
    getItem(key: string) {
      return key === oauthVerifierStorageKey ? verifier || null : null;
    },
    setItem(key: string, value: string) {
      if (key !== oauthVerifierStorageKey) return;
      verifier = value;
      verifierChanged = true;
    },
    removeItem(key: string) {
      if (key !== oauthVerifierStorageKey) return;
      verifier = '';
      verifierChanged = true;
    },
  };

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
      // Supabase only uses a custom storage adapter when session persistence is
      // enabled. The adapter below intentionally persists only the PKCE verifier.
      persistSession: true,
      storage,
      storageKey: oauthStorageKey,
    },
  });

  return {
    supabase,
    applyVerifierCookie(response: NextResponse) {
      if (!verifierChanged) return;

      response.cookies.set(
        oauthVerifierCookieName,
        verifier,
        getOAuthCookieOptions(verifier ? 60 * 10 : 0)
      );
      response.headers.set('Cache-Control', 'private, no-store');
    },
  };
}

export function clearOAuthVerifierCookie(response: NextResponse) {
  response.cookies.set(oauthVerifierCookieName, '', getOAuthCookieOptions(0));
  response.headers.set('Cache-Control', 'private, no-store');
}
