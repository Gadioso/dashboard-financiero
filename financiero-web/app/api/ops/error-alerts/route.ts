import { NextResponse } from 'next/server';
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

function logUnauthorizedOpsRequest(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';

  console.warn('ops.error_alerts_unauthorized', {
    cronSecretConfigured: Boolean(cronSecret),
    cronSecretLength: cronSecret.length,
    authorizationHeaderPresent: Boolean(authorization),
    authorizationPrefixOk: authorization.toLowerCase().startsWith('bearer '),
    bearerLength: getBearerToken(request).length,
  });
}

function formatAlertMessage(events: ErrorEventRow[]) {
  const critical = events.filter((event) => event.severity === 'critical').length;
  const errors = events.filter((event) => event.severity === 'error').length;
  const lines = [
    'Alerta Dashboard Financiero',
    `${events.length} errores nuevos sin resolver. Critical: ${critical}. Error: ${errors}.`,
    '',
    ...events.slice(0, 8).map((event) => {
      const action = event.action || 'sin accion';
      const path = event.request_path || 'sin ruta';
      const code = event.code ? ` [${event.code}]` : '';
      return `- ${event.severity.toUpperCase()} ${action}${code}: ${event.message.slice(0, 140)} (${path})`;
    }),
  ];

  if (events.length > 8) {
    lines.push(`...y ${events.length - 8} mas.`);
  }

  return lines.join('\n');
}

async function sendTelegramAlert(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID || '';

  if (!botToken || !chatId) {
    return { sent: false, reason: 'telegram_not_configured' };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram alert failed: ${response.status} ${body}`);
  }

  return { sent: true, reason: null };
}

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();

  try {
    if (!isAuthorizedOpsRequest(request)) {
      logUnauthorizedOpsRequest(request);
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

    if (events.length === 0) {
      await logAuditEvent({
        supabase,
        request,
        action: 'ops.error_alerts.checked',
        metadata: { unalerted: 0 },
      });

      return NextResponse.json({ success: true, alerted: false, count: 0 });
    }

    const telegram = await sendTelegramAlert(formatAlertMessage(events));
    const eventIds = events.map((event) => event.id);

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
        count: events.length,
        sent: telegram.sent,
        reason: telegram.reason,
        eventIds,
      },
    });

    return NextResponse.json({
      success: true,
      alerted: telegram.sent,
      reason: telegram.reason,
      count: events.length,
    });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      action: 'ops.error_alerts',
      error,
      code: 'ops_error_alerts_failed',
      severity: 'critical',
    });
    const message = error instanceof Error ? error.message : 'No pude revisar alertas.';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
