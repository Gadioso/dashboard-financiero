import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { encryptSecret } from '@/lib/secret-box';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { normalizeProfileId } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const stateCookieName = 'gmail_oauth_state';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GmailProfile = {
  emailAddress?: string;
  historyId?: string;
};

function getStateSecret() {
  return process.env.GMAIL_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function signState(state: string, profileId: string) {
  return createHmac('sha256', getStateSecret()).update(`${state}:${profileId}`).digest('base64url');
}

function parseStateCookie(value: string | undefined, returnedState: string | null) {
  const [state, profileId, signature] = String(value || '').split('.');
  const normalizedProfileId = normalizeProfileId(profileId);

  if (!state || !normalizedProfileId || !signature || state !== returnedState) return null;
  if (signature !== signState(state, normalizedProfileId)) return null;

  return { state, profileId: normalizedProfileId };
}

function buildRedirectUri(origin: string) {
  return process.env.GOOGLE_GMAIL_REDIRECT_URI || new URL('/api/account/gmail/oauth/callback', origin).toString();
}

async function exchangeCode({ code, origin }: { code: string; origin: string }) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET || '',
      redirect_uri: buildRedirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  const data = (await response.json()) as TokenResponse;

  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'No pude obtener tokens de Gmail.');
  }

  return data;
}

async function fetchGmailProfile(accessToken: string) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as GmailProfile & { error?: { message?: string } };

  if (!response.ok || !data.emailAddress) {
    throw new Error(data.error?.message || 'No pude leer el perfil de Gmail.');
  }

  return data;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL('/onboarding?gmail=connected', request.url));

  response.cookies.set(stateCookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  try {
    const supabase = getSupabaseServiceClient();
    const code = requestUrl.searchParams.get('code');
    const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');
    const parsedState = parseStateCookie(request.headers.get('cookie')?.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${stateCookieName}=`))?.slice(stateCookieName.length + 1), requestUrl.searchParams.get('state'));

    if (oauthError) {
      return NextResponse.redirect(new URL(`/onboarding?error=${encodeURIComponent(oauthError)}`, request.url));
    }

    if (!supabase) throw new Error('Falta configurar llave de Supabase.');
    if (!code) throw new Error('No recibí el código de Google.');
    if (!process.env.GOOGLE_GMAIL_CLIENT_ID || !process.env.GOOGLE_GMAIL_CLIENT_SECRET) {
      throw new Error('Faltan GOOGLE_GMAIL_CLIENT_ID o GOOGLE_GMAIL_CLIENT_SECRET.');
    }
    if (!parsedState) throw new Error('La sesión de conexión Gmail expiró. Intenta otra vez.');

    const token = await exchangeCode({ code, origin: requestUrl.origin });
    const accessToken = token.access_token;

    if (!accessToken) throw new Error('Google no devolvió access_token.');

    const gmailProfile = await fetchGmailProfile(accessToken);
    const gmailEmail = gmailProfile.emailAddress;

    if (!gmailEmail) throw new Error('Google no devolvió el correo de Gmail.');

    const now = new Date();
    const expiresAt = token.expires_in ? new Date(now.getTime() + token.expires_in * 1000).toISOString() : null;

    const { error } = await supabase
      .from('gmail_integrations')
      .upsert(
        {
          profile_id: parsedState.profileId,
          email: gmailEmail.toLowerCase(),
          provider: 'gmail',
          status: 'active',
          history_id: gmailProfile.historyId || null,
          access_token_encrypted: encryptSecret(accessToken),
          refresh_token_encrypted: token.refresh_token ? encryptSecret(token.refresh_token) : undefined,
          token_expires_at: expiresAt,
          scope: token.scope || null,
          connected_at: now.toISOString(),
          updated_at: now.toISOString(),
          oauth_provider: 'google',
        },
        { onConflict: 'profile_id,email' }
      );

    if (error) throw new Error(error.message);

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';

    return NextResponse.redirect(new URL(`/onboarding?error=${encodeURIComponent(message)}`, request.url));
  }
}
