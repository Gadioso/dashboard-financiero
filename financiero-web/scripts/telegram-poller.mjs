import fs from 'node:fs';

const envPath = new URL('../.env.local', import.meta.url);
const env = {};

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const index = line.indexOf('=');
    const key = line.slice(0, index);
    const rawValue = line.slice(index + 1).trim();

    try {
      env[key] = JSON.parse(rawValue);
    } catch {
      env[key] = rawValue.replace(/^"|"$/g, '');
    }
  }
}

const botToken = env.TELEGRAM_BOT_TOKEN;
const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
const localWebhookUrl = process.env.LOCAL_TELEGRAM_WEBHOOK_URL || 'http://127.0.0.1:3002/api/telegram/webhook';

if (!botToken) {
  throw new Error('Falta TELEGRAM_BOT_TOKEN en .env.local.');
}

if (!webhookSecret) {
  throw new Error('Falta TELEGRAM_WEBHOOK_SECRET en .env.local.');
}

let offset = 0;

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`${method} falló: ${data.description || 'sin detalle'}`);
  }

  return data.result;
}

async function forwardUpdate(update) {
  const response = await fetch(localWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': webhookSecret,
    },
    body: JSON.stringify(update),
  });

  const text = await response.text();

  if (!response.ok) {
    console.log(`Update ${update.update_id} procesado con respuesta HTTP ${response.status}: ${text}`);
    return;
  }

  console.log(`Update ${update.update_id} procesado.`);
}

console.log(`Telegram poller activo. Enviando updates a ${localWebhookUrl}`);

while (true) {
  try {
    const updates = await telegram('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message'],
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      await forwardUpdate(update);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
