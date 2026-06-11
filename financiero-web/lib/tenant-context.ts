import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export type TenantContext = {
  profileId: string | null;
  source: 'private-env' | 'supabase-auth' | 'telegram' | 'email-ingest' | 'anonymous-private' | 'anonymous';
  email?: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dashboardAuthCookieName = 'dashboard_auth';
const supabaseAccessCookieName = 'sb_access_token';

export function normalizeProfileId(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  return uuidPattern.test(trimmed) ? trimmed : null;
}

export function getPrivateProfileId() {
  return normalizeProfileId(process.env.DASHBOARD_PRIVATE_PROFILE_ID || null);
}

export function getRequiredPrivateProfileId() {
  const profileId = getPrivateProfileId();

  if (!profileId) {
    throw new Error('Falta configurar DASHBOARD_PRIVATE_PROFILE_ID con el id del perfil en Supabase Auth.');
  }

  return profileId;
}

export function getEmailIngestProfileId() {
  const profileId = normalizeProfileId(process.env.EMAIL_INGEST_PROFILE_ID || null);

  if (profileId) return profileId;

  if (process.env.NODE_ENV === 'production') return null;

  return getPrivateProfileId();
}

export function getPrivateTenantContext(): TenantContext {
  const profileId = getPrivateProfileId();

  return {
    profileId,
    source: profileId ? 'private-env' : 'anonymous-private',
  };
}

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

function isPrivateDashboardRequest(request: Request) {
  const expectedToken = process.env.DASHBOARD_ACCESS_TOKEN || '';
  const cookieToken = getCookieValue(request, dashboardAuthCookieName);

  return Boolean(expectedToken && cookieToken === expectedToken);
}

export function getSupabaseAccessToken(request: Request) {
  return getBearerToken(request) || getCookieValue(request, supabaseAccessCookieName);
}

async function ensureProfileForAuthUser({
  supabase,
  userId,
  email,
}: {
  supabase: SupabaseClient;
  userId: string;
  email?: string | null;
}) {
  const profileId = normalizeProfileId(userId);

  if (!profileId) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: profileId,
        email: email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) {
    throw new Error(`No pude asegurar el perfil del usuario autenticado: ${error.message}`);
  }
}

export async function getRequestTenantContext(request: Request): Promise<TenantContext> {
  if (isPrivateDashboardRequest(request)) {
    return getPrivateTenantContext();
  }

  const accessToken = getSupabaseAccessToken(request);
  const supabase = accessToken ? getSupabaseServiceClient() : null;

  if (accessToken && supabase) {
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (!error && data.user?.id) {
      const profileId = normalizeProfileId(data.user.id);
      const email = data.user.email || null;

      if (profileId) {
        await ensureProfileForAuthUser({ supabase, userId: profileId, email });
        return { profileId, source: 'supabase-auth', email };
      }
    }

    return { profileId: null, source: 'anonymous' };
  }

  if (process.env.NODE_ENV === 'production') {
    return { profileId: null, source: 'anonymous' };
  }

  return getPrivateTenantContext();
}

export async function getTelegramTenantContext({
  supabase,
  chatId,
}: {
  supabase: SupabaseClient;
  chatId?: number | string | null;
}): Promise<TenantContext> {
  if (chatId) {
    const { data } = await supabase
      .from('telegram_accounts')
      .select('profile_id')
      .eq('chat_id', String(chatId))
      .maybeSingle();
    const profileId = normalizeProfileId((data as { profile_id?: string | null } | null)?.profile_id || null);

    if (profileId) {
      return { profileId, source: 'telegram' };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return { profileId: null, source: 'anonymous' };
  }

  return getPrivateTenantContext();
}

function normalizeEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();

  return trimmed && trimmed.includes('@') ? trimmed : null;
}

export async function getEmailIngestTenantContext({
  supabase,
  email,
}: {
  supabase?: SupabaseClient | null;
  email?: string | null;
} = {}): Promise<TenantContext> {
  const normalizedEmail = normalizeEmail(email);

  if (supabase && normalizedEmail) {
    const { data } = await supabase
      .from('gmail_integrations')
      .select('profile_id, email, status')
      .eq('email', normalizedEmail)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const profileId = normalizeProfileId((data as { profile_id?: string | null } | null)?.profile_id || null);

    if (profileId) {
      return { profileId, source: 'email-ingest', email: normalizedEmail };
    }
  }

  const profileId = getEmailIngestProfileId();

  if (profileId) {
    return { profileId, source: 'email-ingest', email: normalizedEmail };
  }

  if (process.env.NODE_ENV === 'production') {
    return { profileId: null, source: 'anonymous', email: normalizedEmail };
  }

  return { ...getPrivateTenantContext(), email: normalizedEmail };
}

export function withProfile<T extends Record<string, unknown>>(payload: T, profileId?: string | null): T & { profile_id?: string } {
  if (!profileId) return payload;

  return {
    ...payload,
    profile_id: profileId,
  };
}

export function applyProfileFilter<Query>(query: Query, profileId?: string | null): Query {
  if (!profileId) return query;

  return (query as Query & { eq: (column: string, value: string) => Query }).eq('profile_id', profileId);
}
