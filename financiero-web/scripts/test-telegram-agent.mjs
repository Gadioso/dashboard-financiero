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

const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
const localWebhookUrl = process.env.LOCAL_TELEGRAM_WEBHOOK_URL || 'http://127.0.0.1:3002/api/telegram/webhook';
const prompts = process.argv.slice(2);
const safePrompts = prompts.length ? prompts : ['ayuda', 'como voy este mes', 'ultimos 3 gastos', 'gastos de placeres de junio', 'borra starbucks'];

if (!webhookSecret) {
  throw new Error('Falta TELEGRAM_WEBHOOK_SECRET en .env.local.');
}

for (const prompt of safePrompts) {
  if (/\b(confirmar|confirma|confirmo|si)\s+(eliminar|borrar)\b/i.test(prompt)) {
    console.log(JSON.stringify({ prompt, skipped: true, reason: 'El script no ejecuta confirmaciones de borrado.' }, null, 2));
    continue;
  }

  const response = await fetch(localWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': webhookSecret,
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 1,
        text: prompt,
      },
    }),
  });

  const body = await response.text();
  let parsed = body;

  try {
    parsed = JSON.parse(body);
  } catch {
    // Keep raw response text.
  }

  console.log(JSON.stringify({ prompt, status: response.status, response: parsed }, null, 2));
}
