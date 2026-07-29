import { NextResponse } from 'next/server';
import {
  formatOpsAlertMessage,
  isRecursiveTelegramAlertFailure,
  validateTelegramAlertTarget,
} from '@/lib/ops-error-alerts';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type ErrorEventRow = {
  id: string;
  profile_id?: string | null;
  actor_email?: string | null;
  action?: string | null;
  request_path?: string | null;
  message: string;
  code?: string | null;
  severity: 'warning' | 'error' | 'critical';
  created_at: string;
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

function isAuthorizedOpsRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';

  if (!cronSecret) return false;

  return getBearerToken(request) === cronSecret;
}

function isNonActionableProviderEvent(event: ErrorEventRow) {
  const action = event.action || '';
  const message = event.message || '';
  const code = event.code || '';

  return action === 'investment_market_sync.run' &&
    (
      code === 'binance_region_unavailable' ||
      /binance/i.test(message) && /\b451\b/.test(message)
    );
}

async function sendTelegramAlert(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID || '';
  const target = validateTelegramAlertTarget(botToken, chatId);

  if (!target.valid && target.reason === 'telegram_not_configured') {
    return { sent: false, reason: 'telegram_not_configured' };
  }
  if (!target.valid) throw new TelegramAlertDeliveryError(target.reason);

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: target.chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new TelegramAlertDeliveryError(`Telegram alert failed: ${response.status} ${body}`);
  }

  return { sent: true, reason: null };
}

class TelegramAlertDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramAlertDeliveryError';
  }
}

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();

  try {
    if (!isAuthorizedOpsRequest(request)) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('error_events')
      .select('id, profile_id, actor_email, action, request_path, message, code, severity, created_at')
      .in('severity', ['error', 'critical'])
      .is('resolved_at', null)
      .is('alerted_at', null)
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      throw new Error(error.message);
    }

    const events = (data || []) as ErrorEventRow[];
    const suppressedEvents = events.filter((event) =>
      isNonActionableProviderEvent(event) || isRecursiveTelegramAlertFailure(event)
    );
    const alertableEvents = events.filter((event) =>
      !isNonActionableProviderEvent(event) && !isRecursiveTelegramAlertFailure(event)
    );

    if (suppressedEvents.length > 0) {
      const suppressedIds = suppressedEvents.map((event) => event.id);
      await supabase
        .from('error_events')
        .update({
          alerted_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
        })
        .in('id', suppressedIds);

      await logAuditEvent({
        supabase,
        request,
        action: 'ops.error_alerts.suppressed',
        metadata: {
          reasons: {
            nonActionableProvider: suppressedEvents.filter(isNonActionableProviderEvent).length,
            recursiveTelegramAlertFailure: suppressedEvents.filter(isRecursiveTelegramAlertFailure).length,
          },
          count: suppressedIds.length,
          eventIds: suppressedIds,
        },
      });
    }

    if (alertableEvents.length === 0) {
      await logAuditEvent({
        supabase,
        request,
        action: 'ops.error_alerts.checked',
        metadata: { unalerted: 0, suppressed: suppressedEvents.length },
      });

      return NextResponse.json({ success: true, alerted: false, count: 0, suppressed: suppressedEvents.length });
    }

    const telegram = await sendTelegramAlert(formatOpsAlertMessage(alertableEvents));
    const eventIds = alertableEvents.map((event) => event.id);

    if (telegram.sent) {
      await supabase
        .from('error_events')
        .update({ alerted_at: new Date().toISOString() })
        .in('id', eventIds);
    }

    await logAuditEvent({
      supabase,
      request,
      action: 'ops.error_alerts.sent',
      metadata: {
        count: alertableEvents.length,
        alertable: alertableEvents.length,
        suppressed: suppressedEvents.length,
        sent: telegram.sent,
        reason: telegram.reason,
        eventIds,
      },
    });

    return NextResponse.json({
      success: true,
      alerted: telegram.sent,
      reason: telegram.reason,
      count: alertableEvents.length,
      suppressed: suppressedEvents.length,
    });
  } catch (error: unknown) {
    if (error instanceof TelegramAlertDeliveryError) {
      console.error('[ops.error_alerts] Telegram delivery failed without recursive error logging:', error.message);
      await logAuditEvent({
        supabase,
        request,
        action: 'ops.error_alerts.delivery_failed',
        metadata: { reason: error.message.slice(0, 300) },
      });
    } else {
      await logErrorEvent({
        supabase,
        request,
        action: 'ops.error_alerts',
        error,
        code: 'ops_error_alerts_failed',
        severity: 'critical',
      });
    }
    const message = error instanceof Error ? error.message : 'No pude revisar alertas.';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
