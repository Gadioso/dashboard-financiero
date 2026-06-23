import fs from 'node:fs';

function readEnvFile(path) {
  if (!fs.existsSync(path)) return {};

  return Object.fromEntries(
    fs.readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
}

const env = {
  ...readEnvFile('.env.local'),
  ...process.env,
};

const token = env.TELEGRAM_BOT_TOKEN || '';
const secret = env.TELEGRAM_WEBHOOK_SECRET || '';
const appUrl = (env.NEXT_PUBLIC_APP_URL || env.APP_URL || '').replace(/\/$/, '');
const shouldRepair = process.argv.includes('--repair');

if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram ${method} falló.`);
  }

  return data.result;
}

const expectedUrl = appUrl ? `${appUrl}/api/telegram/webhook` : '';

if (shouldRepair) {
  if (!expectedUrl) {
    console.error('Falta NEXT_PUBLIC_APP_URL o APP_URL para reparar el webhook.');
    process.exit(1);
  }

  await telegram('setWebhook', {
    url: expectedUrl,
    ...(secret ? { secret_token: secret } : {}),
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
}

const status = await telegram('getWebhookInfo');

console.log(JSON.stringify({
  expectedUrl: expectedUrl || null,
  actualUrl: status.url || null,
  urlMatches: expectedUrl ? status.url === expectedUrl : null,
  hasCustomCertificate: Boolean(status.has_custom_certificate),
  pendingUpdateCount: status.pending_update_count || 0,
  lastErrorDate: status.last_error_date ? new Date(status.last_error_date * 1000).toISOString() : null,
  lastErrorMessage: status.last_error_message || null,
  repaired: shouldRepair,
  secretConfiguredLocally: Boolean(secret),
}, null, 2));
