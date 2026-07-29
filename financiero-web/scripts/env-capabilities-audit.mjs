import fs from 'node:fs';

const envGroups = {
  core: ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ai: ['GEMINI_API_KEY'],
  scheduler: ['CRON_SECRET'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_NOTIFY_CHAT_ID'],
  billing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PREMIUM_MONTHLY'],
};

function readEnvFile(file) {
  if (!fs.existsSync(file)) return new Set();

  return new Set(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).replace(/^export\s+/, '').trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
        return value ? key : null;
      })
      .filter(Boolean)
  );
}

const keys = new Set([
  ...Object.keys(process.env),
  ...readEnvFile('.env.local'),
  ...readEnvFile('.env'),
  ...readEnvFile('../.env'),
]);

const groups = Object.fromEntries(Object.entries(envGroups).map(([name, required]) => {
  const present = required.filter((key) => keys.has(key));
  const missing = required.filter((key) => !keys.has(key));
  return [name, { present, missing, complete: missing.length === 0 }];
}));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  deploymentTarget: 'railway',
  groups,
  capabilities: {
    ai: groups.ai.complete,
    telegram: groups.telegram.complete,
    billing: groups.billing.complete,
  },
}, null, 2));

if (!groups.core.complete || !groups.ai.complete || !groups.scheduler.complete) process.exitCode = 1;
