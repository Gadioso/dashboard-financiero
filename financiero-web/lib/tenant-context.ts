import type { SupabaseClient } from '@supabase/supabase-js';

export type TenantContext = {
  profileId: string | null;
  source: 'private-env' | 'telegram' | 'email-ingest' | 'anonymous-private';
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return normalizeProfileId(process.env.EMAIL_INGEST_PROFILE_ID || null) || getPrivateProfileId();
}

export function getPrivateTenantContext(): TenantContext {
  const profileId = getPrivateProfileId();

  return {
    profileId,
    source: profileId ? 'private-env' : 'anonymous-private',
  };
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

  return getPrivateTenantContext();
}

export function getEmailIngestTenantContext(): TenantContext {
  const profileId = getEmailIngestProfileId();

  return {
    profileId,
    source: profileId ? 'email-ingest' : 'anonymous-private',
  };
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
