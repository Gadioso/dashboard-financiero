export type OpsErrorEvent = {
  id: string;
  action?: string | null;
  request_path?: string | null;
  message: string;
  code?: string | null;
  severity: 'warning' | 'error' | 'critical';
};

export function telegramBotIdFromToken(token: string) {
  const match = token.trim().match(/^(\d+):/);
  return match?.[1] || null;
}

export function validateTelegramAlertTarget(botToken: string, chatId: string) {
  const cleanChatId = chatId.trim();
  const botId = telegramBotIdFromToken(botToken);

  if (!botToken.trim() || !cleanChatId) {
    return { valid: false as const, reason: 'telegram_not_configured' };
  }

  if (botId && cleanChatId === botId) {
    return { valid: false as const, reason: 'telegram_chat_is_bot_id' };
  }

  return { valid: true as const, chatId: cleanChatId };
}

export function isRecursiveTelegramAlertFailure(event: OpsErrorEvent) {
  return event.action === 'ops.error_alerts'
    && event.code === 'ops_error_alerts_failed'
    && /telegram alert failed|bot can't send messages to the bot|telegram_chat_is_bot_id/i.test(event.message);
}

function fingerprint(event: OpsErrorEvent) {
  return [
    event.severity,
    event.action || '',
    event.code || '',
    event.request_path || '',
    event.message,
  ].join('\u0000');
}

export function formatOpsAlertMessage(events: OpsErrorEvent[]) {
  const critical = events.filter((event) => event.severity === 'critical').length;
  const errors = events.filter((event) => event.severity === 'error').length;
  const grouped = new Map<string, { event: OpsErrorEvent; count: number }>();

  for (const event of events) {
    const key = fingerprint(event);
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, count: current.count + 1 } : { event, count: 1 });
  }

  const lines = [
    'Alerta Virafi',
    `${events.length} errores nuevos sin resolver. Críticos: ${critical}. Errores: ${errors}.`,
    '',
    ...[...grouped.values()].slice(0, 8).map(({ event, count }) => {
      const action = event.action || 'sin acción';
      const path = event.request_path || 'sin ruta';
      const code = event.code ? ` [${event.code}]` : '';
      const repetitions = count > 1 ? ` (repetido ${count} veces)` : '';
      return `- ${event.severity.toUpperCase()} ${action}${code}: ${event.message.slice(0, 140)}${repetitions} (${path})`;
    }),
  ];

  if (grouped.size > 8) lines.push(`...y ${grouped.size - 8} tipos de error más.`);
  return lines.join('\n');
}
