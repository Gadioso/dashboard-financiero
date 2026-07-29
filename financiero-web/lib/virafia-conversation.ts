import type { SupabaseClient } from '@supabase/supabase-js';

export type VirafiaConversationMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  channel?: 'in_app' | 'telegram' | 'proactive' | 'system';
  metadata?: Record<string, unknown>;
};

export async function readVirafiaConversation({
  supabase,
  profileId,
  limit = 16,
}: {
  supabase: SupabaseClient;
  profileId: string;
  limit?: number;
}): Promise<VirafiaConversationMessage[]> {
  const { data, error } = await supabase
    .from('virafia_conversation_messages')
    .select('id, role, content, channel, metadata, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 40));

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(`No pude leer la conversación de VirafIA: ${error.message}`);
  }

  return (data || []).reverse().map((message) => ({
    id: String(message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    content: String(message.content || ''),
    createdAt: String(message.created_at),
    channel: message.channel as VirafiaConversationMessage['channel'],
    metadata: message.metadata && typeof message.metadata === 'object'
      ? message.metadata as Record<string, unknown>
      : undefined,
  }));
}

export async function appendVirafiaConversationMessage({
  supabase,
  profileId,
  role,
  content,
  channel,
  dailyBriefingId,
  metadata = {},
  createdAt,
}: {
  supabase: SupabaseClient;
  profileId: string;
  role: 'user' | 'assistant';
  content: string;
  channel: 'in_app' | 'telegram' | 'proactive' | 'system';
  dailyBriefingId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}) {
  const cleanContent = content.trim().slice(0, 8000);
  if (!cleanContent) return null;

  const { data, error } = await supabase
    .from('virafia_conversation_messages')
    .insert({
      profile_id: profileId,
      role,
      content: cleanContent,
      channel,
      daily_briefing_id: dailyBriefingId || null,
      metadata,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select('id, role, content, channel, metadata, created_at')
    .single();

  if (error) {
    if (error.code === '23505' && dailyBriefingId) return null;
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(`No pude guardar la conversación de VirafIA: ${error.message}`);
  }

  return data;
}

export async function appendVirafiaExchange({
  supabase,
  profileId,
  userText,
  assistantText,
  channel = 'in_app',
  assistantMetadata = {},
}: {
  supabase: SupabaseClient;
  profileId: string;
  userText: string;
  assistantText: string;
  channel?: 'in_app' | 'telegram';
  assistantMetadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const rows = [
    {
      profile_id: profileId,
      role: 'user',
      content: userText.trim().slice(0, 8000),
      channel,
      metadata: {},
      created_at: now,
    },
    {
      profile_id: profileId,
      role: 'assistant',
      content: assistantText.trim().slice(0, 8000),
      channel,
      metadata: assistantMetadata,
      created_at: now,
    },
  ].filter((row) => row.content);

  if (!rows.length) return;
  const { error } = await supabase.from('virafia_conversation_messages').insert(rows);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(`No pude guardar el intercambio con VirafIA: ${error.message}`);
  }
}

export async function appendProactiveMessageToTelegramMemory({
  supabase,
  profileId,
  chatId,
  content,
  dailyBriefingId,
}: {
  supabase: SupabaseClient;
  profileId: string;
  chatId: string;
  content: string;
  dailyBriefingId: string;
}) {
  const { data } = await supabase
    .from('telegram_memoria')
    .select('messages')
    .eq('chat_id', chatId)
    .eq('profile_id', profileId)
    .maybeSingle();
  const previous = Array.isArray(data?.messages) ? data.messages : [];
  const now = new Date().toISOString();
  const messages = [
    ...previous,
    {
      role: 'assistant',
      content: content.trim().slice(0, 8000),
      createdAt: now,
      metadata: { dailyBriefingId },
    },
  ].slice(-16);

  const { error } = await supabase.from('telegram_memoria').upsert({
    chat_id: chatId,
    profile_id: profileId,
    messages,
    updated_at: now,
  }, { onConflict: 'chat_id' });

  if (error) throw new Error(`No pude enlazar el mensaje diario con Telegram: ${error.message}`);
}
