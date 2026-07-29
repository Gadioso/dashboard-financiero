import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatOpsAlertMessage,
  isRecursiveTelegramAlertFailure,
  telegramBotIdFromToken,
  validateTelegramAlertTarget,
} from '../lib/ops-error-alerts.ts';

test('rejects the bot id as a Telegram notification target', () => {
  assert.equal(telegramBotIdFromToken('123456:secret'), '123456');
  assert.deepEqual(
    validateTelegramAlertTarget('123456:secret', '123456'),
    { valid: false, reason: 'telegram_chat_is_bot_id' },
  );
  assert.deepEqual(
    validateTelegramAlertTarget('123456:secret', '987654'),
    { valid: true, chatId: '987654' },
  );
});

test('recognizes historical self-referential delivery failures', () => {
  assert.equal(isRecursiveTelegramAlertFailure({
    id: '1',
    action: 'ops.error_alerts',
    code: 'ops_error_alerts_failed',
    request_path: '/api/ops/error-alerts',
    severity: 'critical',
    message: 'Telegram alert failed: 403 {"description":"Forbidden: the bot can\'t send messages to the bot"}',
  }), true);
});

test('groups duplicate events in one readable alert while preserving totals', () => {
  const duplicate = {
    action: 'dashboard_chat.message',
    code: null,
    request_path: '/api/dashboard/chat',
    severity: 'error' as const,
    message: 'No pude registrar el movimiento.',
  };
  const message = formatOpsAlertMessage([
    { id: '1', ...duplicate },
    { id: '2', ...duplicate },
  ]);

  assert.match(message, /2 errores nuevos/);
  assert.match(message, /repetido 2 veces/);
  assert.equal((message.match(/dashboard_chat\.message/g) || []).length, 1);
});
