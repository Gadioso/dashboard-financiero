import { NextResponse, type NextRequest } from 'next/server';

const authCookieName = 'dashboard_auth';
const supabaseAccessCookieName = 'sb_access_token';

function dashboardAuthEnabled() {
  return Boolean(process.env.DASHBOARD_ACCESS_TOKEN) || process.env.NODE_ENV === 'production';
}

function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/auth/callback' ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/account/gmail/oauth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  );
}

function isTrustedWebhook(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/api/telegram/webhook') return true;
  if (pathname === '/api/email/santander' && request.method === 'POST') return true;
  if (pathname === '/api/billing/webhook' && request.method === 'POST') return true;
  if (pathname === '/api/bank/syncfy/webhook' && request.method === 'POST') return true;

  return false;
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

function isTrustedServerToServer(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cronSecret = process.env.CRON_SECRET || '';

  if (!cronSecret) return false;
  if (
    pathname !== '/api/email/gmail/sync' &&
    pathname !== '/api/bank/syncfy/auto-sync' &&
    pathname !== '/api/fiscal/syncfy/auto-sync' &&
    pathname !== '/api/agents/proactive-goal' &&
    pathname !== '/api/investments/market-sync' &&
    pathname !== '/api/ops/error-alerts' &&
    pathname !== '/api/ops/sentry-test'
  ) return false;

  return getBearerToken(request) === cronSecret;
}

export function proxy(request: NextRequest) {
  if (
    !dashboardAuthEnabled() ||
    isPublicPath(request.nextUrl.pathname) ||
    isTrustedWebhook(request) ||
    isTrustedServerToServer(request)
  ) {
    return NextResponse.next();
  }

  const token = process.env.DASHBOARD_ACCESS_TOKEN || '';
  const cookieToken = request.cookies.get(authCookieName)?.value || '';
  const supabaseAccessToken = request.cookies.get(supabaseAccessCookieName)?.value || '';

  if (token && cookieToken === token) {
    return NextResponse.next();
  }

  if (supabaseAccessToken) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
