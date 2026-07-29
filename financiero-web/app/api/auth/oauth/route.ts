import { NextResponse } from 'next/server';
import type { Provider } from '@supabase/supabase-js';
import { getAppOrigin, getSafeNext } from '@/lib/auth-session';
import { getSupabaseOAuthClient } from '@/lib/supabase-server';

const supportedProviders = new Set(['google', 'apple']);

function getProvider(value?: string | null): Provider | null {
  return value && supportedProviders.has(value) ? (value as Provider) : null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const provider = getProvider(requestUrl.searchParams.get('provider'));
  const safeNext = getSafeNext(requestUrl.searchParams.get('next'));
  const appOrigin = getAppOrigin(request);

  if (!provider) {
    return NextResponse.redirect(new URL(`/login?error=Proveedor no soportado&next=${encodeURIComponent(safeNext)}`, request.url));
  }

  const oauth = getSupabaseOAuthClient(request);

  if (!oauth) {
    return NextResponse.redirect(new URL(`/login?error=Falta configurar Supabase Auth&next=${encodeURIComponent(safeNext)}`, request.url));
  }

  const callbackUrl = new URL('/api/auth/callback', appOrigin);
  callbackUrl.searchParams.set('next', safeNext);

  const { data, error } = await oauth.supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message || 'No pude iniciar OAuth')}&next=${encodeURIComponent(safeNext)}`, request.url)
    );
  }

  const response = NextResponse.redirect(data.url);
  oauth.applyVerifierCookie(response);

  return response;
}
