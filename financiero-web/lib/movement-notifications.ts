import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthorizedTelegramChatId } from '@/lib/telegram-access';

type MovementNotice = {
  profileId: string;
  type: 'ingreso' | 'gasto' | 'abono';
  concept: string;
  amount: number;
  category?: string | null;
  source: string;
  resourceId?: string | number | null;
  eventKey?: string | null;
};

export type BankMovementDeliveryNotice = {
  rawTransactionId: string;
  description: string;
  amount: number;
  currency: string;
  postedAt: string;
  institution?: string | null;
  normalizedStatus?: string | null;
};

type PendingDelivery = {
  id: string;
  profile_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  status: 'pending' | 'failed';
};

function valueAsText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function valueAsNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function telegramMovementMessage(payload: Record<string, unknown>) {
  const amount = valueAsNumber(payload.amount);
  const currency = valueAsText(payload.currency, 'MXN');
  const money = Math.abs(amount).toLocaleString('es-MX', { style: 'currency', currency });
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const institution = valueAsText(payload.institution, 'Banco');
  const description = valueAsText(payload.description, 'Movimiento bancario');
  const postedAt = valueAsText(payload.postedAt, 'Fecha pendiente');
  const status = valueAsText(payload.normalizedStatus, 'pending');
  const statusLabel = status === 'failed'
    ? 'Guardado en el dashboard · requiere revisión'
    : status === 'ignored'
      ? 'Guardado en el dashboard · transferencia/contrapartida'
      : 'Guardado automáticamente en el dashboard';

  return `Movimiento bancario detectado\n${institution} · ${description}\n${sign}${money}\nFecha: ${postedAt}\n${statusLabel}`;
}

export async function queueBankMovementNotifications(
  supabase: SupabaseClient,
  profileId: string,
  movements: BankMovementDeliveryNotice[]
) {
  if (!movements.length) return { queued: 0 };

  const rows = movements.map((movement) => ({
    profile_id: profileId,
    bank_transaction_raw_id: movement.rawTransactionId,
    channel: 'telegram',
    dedup_key: `bank:${movement.rawTransactionId}`,
    status: 'pending',
    payload: {
      description: movement.description,
      amount: movement.amount,
      currency: movement.currency || 'MXN',
      postedAt: movement.postedAt,
      institution: movement.institution || 'Banco',
      normalizedStatus: movement.normalizedStatus || 'pending',
    },
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const { data, error } = await supabase
    .from('movement_notification_deliveries')
    .upsert(rows, { onConflict: 'profile_id,channel,dedup_key', ignoreDuplicates: true })
    .select('id');

  if (error) throw new Error(`No pude encolar las notificaciones bancarias: ${error.message}`);
  return { queued: data?.length || 0 };
}

export async function deliverPendingMovementNotifications(
  supabase: SupabaseClient,
  options: { profileId?: string | null; limit?: number } = {}
) {
  const now = new Date().toISOString();
  const limit = Math.max(1, Math.min(options.limit || 50, 100));
  let query = supabase
    .from('movement_notification_deliveries')
    .select('id, profile_id, payload, attempt_count, status')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (options.profileId) query = query.eq('profile_id', options.profileId);

  const { data, error } = await query;
  if (error) throw new Error(`No pude leer la cola de Telegram: ${error.message}`);

  const deliveries = (data || []) as PendingDelivery[];
  const chatIds = new Map<string, string | null>();
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const claimed = await supabase
      .from('movement_notification_deliveries')
      .update({ status: 'sending', last_attempt_at: now, updated_at: now })
      .eq('id', delivery.id)
      .eq('profile_id', delivery.profile_id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimed.error || !claimed.data) continue;

    if (!chatIds.has(delivery.profile_id)) {
      chatIds.set(
        delivery.profile_id,
        await getAuthorizedTelegramChatId({ supabase, profileId: delivery.profile_id })
      );
    }

    const chatId = chatIds.get(delivery.profile_id);
    let deliveryError: string | null = null;
    if (!token) deliveryError = 'Falta TELEGRAM_BOT_TOKEN.';
    if (!chatId) deliveryError = 'No hay un chat de Telegram vinculado.';

    if (!deliveryError) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: telegramMovementMessage(delivery.payload) }),
        });
        const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
        if (!response.ok || result?.ok === false) {
          deliveryError = result?.description || `Telegram rechazó el mensaje (${response.status}).`;
        }
      } catch (sendError: unknown) {
        deliveryError = sendError instanceof Error ? sendError.message : 'No pude conectar con Telegram.';
      }
    }

    const attempts = Number(delivery.attempt_count || 0) + 1;
    if (!deliveryError) {
      sent += 1;
      await supabase
        .from('movement_notification_deliveries')
        .update({ status: 'sent', attempt_count: attempts, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq('id', delivery.id)
        .eq('profile_id', delivery.profile_id);
      continue;
    }

    failed += 1;
    const retrySeconds = Math.min(3600, Math.max(60, 60 * (2 ** Math.min(attempts - 1, 5))));
    await supabase
      .from('movement_notification_deliveries')
      .update({
        status: 'failed',
        attempt_count: attempts,
        next_attempt_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
        last_error: deliveryError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
      .eq('profile_id', delivery.profile_id);
  }

  return { processed: deliveries.length, sent, failed };
}

export async function notifyDetectedMovement(supabase: SupabaseClient, notice: MovementNotice) {
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(notice.amount);
  const title = notice.type === 'ingreso'
    ? `Ingreso detectado: ${money}`
    : notice.type === 'abono'
      ? `Abono a tarjeta detectado: ${money}`
      : `Gasto detectado: ${money}`;
  const detail = [notice.concept, notice.category, notice.source].filter(Boolean).join(' · ');

  if (notice.eventKey) {
    const existing = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('profile_id', notice.profileId)
      .eq('agent_key', 'movement_monitor')
      .contains('metadata', { eventKey: notice.eventKey })
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) return { inboxCreated: false, telegramSent: false };
  }

  const inboxResult = await supabase.from('agent_tasks').insert({
    profile_id: notice.profileId,
    agent_key: 'movement_monitor',
    title,
    description: detail,
    status: 'open',
    priority: 'medium',
    source: 'system',
    metadata: {
      eventKey: notice.eventKey || null,
      source: notice.source,
      category: notice.category || null,
      resourceType: notice.type === 'ingreso' ? 'ingresos' : notice.type === 'abono' ? 'abonos_tarjeta_credito' : 'gastos',
      resourceId: notice.resourceId ? String(notice.resourceId) : null,
    },
  });
  if (inboxResult.error) throw new Error(`No pude crear la notificación: ${inboxResult.error.message}`);

  // Telegram delivery is handled once per raw bank transaction by the durable queue.
  return { inboxCreated: true, telegramSent: false };
}
