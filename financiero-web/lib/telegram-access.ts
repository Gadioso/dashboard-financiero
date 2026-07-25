import type { SupabaseClient } from '@supabase/supabase-js';

export type AppMembershipStatus = 'active' | 'inactive' | 'unknown';

function isNotFoundError(error: { code?: string; message?: string; status?: number } | null) {
  return error?.status === 404 ||
    error?.code === 'user_not_found' ||
    /user not found/i.test(error?.message || '');
}

export async function getAppMembershipStatus({
  supabase,
  profileId,
}: {
  supabase: SupabaseClient;
  profileId: string;
}): Promise<AppMembershipStatus> {
  const profileResult = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();

  if (profileResult.error) return 'unknown';
  if (!profileResult.data?.id) return 'inactive';

  const { data, error } = await supabase.auth.admin.getUserById(profileId);

  if (error) return isNotFoundError(error) ? 'inactive' : 'unknown';

  const user = data.user;
  if (!user || user.deleted_at || user.is_anonymous) return 'inactive';

  if (user.banned_until) {
    const bannedUntil = new Date(user.banned_until).getTime();
    if (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) return 'inactive';
  }

  return 'active';
}

export async function revokeTelegramAccess({
  supabase,
  profileId,
  chatId,
}: {
  supabase: SupabaseClient;
  profileId: string;
  chatId?: string | number | null;
}) {
  const chatIdText = chatId === null || chatId === undefined ? '' : String(chatId);

  let memoryQuery = supabase
    .from('telegram_memoria')
    .delete()
    .eq('profile_id', profileId);
  let accountQuery = supabase
    .from('telegram_accounts')
    .delete()
    .eq('profile_id', profileId);

  if (chatIdText) {
    memoryQuery = memoryQuery.eq('chat_id', chatIdText);
    accountQuery = accountQuery.eq('chat_id', chatIdText);
  }

  const [memoryResult, accountResult] = await Promise.all([memoryQuery, accountQuery]);

  if (memoryResult.error) {
    throw new Error(`No pude revocar la memoria de Telegram: ${memoryResult.error.message}`);
  }

  if (accountResult.error) {
    throw new Error(`No pude revocar la cuenta de Telegram: ${accountResult.error.message}`);
  }
}

export async function getAuthorizedTelegramChatId({
  supabase,
  profileId,
}: {
  supabase: SupabaseClient;
  profileId: string;
}) {
  const accountResult = await supabase
    .from('telegram_accounts')
    .select('chat_id')
    .eq('profile_id', profileId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accountResult.error || !accountResult.data?.chat_id) return null;

  const membership = await getAppMembershipStatus({ supabase, profileId });

  if (membership === 'inactive') {
    await revokeTelegramAccess({
      supabase,
      profileId,
      chatId: accountResult.data.chat_id,
    });
  }

  return membership === 'active' ? String(accountResult.data.chat_id) : null;
}
