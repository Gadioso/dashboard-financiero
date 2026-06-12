import { createHmac, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const stateCookieName = 'gmail_oauth_state';
const scopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

function getStateSecret() {
  return process.env.GMAIL_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function signState(state: string, profileId: string) {
  return createHmac('sha256', getStateSecret()).update(`${state}:${profileId}`).digest('base64url');
}

function buildRedirectUri(origin: string) {
  return process.env.GOOGLE_GMAIL_REDIRECT_URI || new URL('/api/account/gmail/oauth/callback', origin).toString();
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tenant = await getRequestTenantContext(request);
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || '';
  const stateSecret = getStateSecret();

  if (!tenant.profileId) {
    return NextResponse.redirect(new URL('/onboarding?error=gmail-auth-required', request.url));
  }

  if (!clientId || !stateSecret) {
    return NextResponse.redirect(new URL('/onboarding?error=gmail-oauth-not-configured', request.url));
  }

  const state = randomBytes(24).toString('base64url');
  const signed = `${state}.${tenant.profileId}.${signState(state, tenant.profileId)}`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', buildRedirectUri(requestUrl.origin));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);
  if (tenant.email) authUrl.searchParams.set('login_hint', tenant.email);

  const response = NextResponse.redirect(authUrl);

  response.cookies.set(stateCookieName, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });

  return response;
}
