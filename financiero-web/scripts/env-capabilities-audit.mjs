import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const envGroups = {
  core: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DASHBOARD_ACCESS_TOKEN'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_NOTIFY_CHAT_ID'],
  voicePreferred: ['OPENROUTER_API_KEY', 'OPENROUTER_TRANSCRIPTION_MODEL'],
  voiceFallback: ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  aiAnalysis: ['AI_GATEWAY_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  billing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PREMIUM_MONTHLY'],
  observability: ['SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'CRON_SECRET'],
  banking: ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PROMETEO_API_KEY', 'BANK_TOKEN_ENCRYPTION_KEY'],
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
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return value ? key : null;
      })
      .filter(Boolean)
  );
}

function localEnvKeys() {
  return new Set([
    ...Object.keys(process.env),
    ...readEnvFile('.env.local'),
    ...readEnvFile('.env'),
    ...readEnvFile('../.env'),
  ]);
}

function vercelEnvKeys() {
  try {
    const output = execFileSync('npx', ['vercel', 'env', 'ls'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const keys = new Set();

    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s+Encrypted\s+/);
      if (match) keys.add(match[1]);
    }

    return { ok: true, keys, error: null };
  } catch (error) {
    return { ok: false, keys: new Set(), error: error instanceof Error ? error.message : String(error) };
  }
}

function groupStatus(keys, groupKeys) {
  const present = groupKeys.filter((key) => keys.has(key));
  const missing = groupKeys.filter((key) => !keys.has(key));

  return { present, missing, complete: missing.length === 0 };
}

function capabilityStatus(keys) {
  const hasTelegram = envGroups.telegram.every((key) => keys.has(key));
  const hasGemini = keys.has('GEMINI_API_KEY') || keys.has('GOOGLE_API_KEY');
  const hasOpenRouter = keys.has('OPENROUTER_API_KEY');
  const hasOpenAI = keys.has('OPENAI_API_KEY');

  return {
    telegramText: hasTelegram,
    telegramVoice: hasTelegram && (hasOpenRouter || hasOpenAI || hasGemini),
    voicePreferredProvider: hasOpenRouter ? 'openrouter' : hasOpenAI ? 'openai' : hasGemini ? 'gemini' : null,
    aiAnalysis: keys.has('AI_GATEWAY_API_KEY') || hasOpenRouter || hasGemini,
    gaps: [
      ...(!hasOpenRouter ? ['OPENROUTER_API_KEY falta para que voz use OpenRouter como proveedor preferente.'] : []),
      ...(!hasOpenAI ? ['OPENAI_API_KEY falta como respaldo opcional de voz.'] : []),
      ...(hasTelegram && !hasOpenRouter && !hasOpenAI && !hasGemini ? ['No hay proveedor de transcripción de voz configurado.'] : []),
    ],
  };
}

function auditSource(name, keys, sourceError = null) {
  const groups = Object.fromEntries(
    Object.entries(envGroups).map(([groupName, groupKeys]) => [groupName, groupStatus(keys, groupKeys)])
  );

  return {
    source: name,
    readable: !sourceError,
    error: sourceError,
    capabilities: capabilityStatus(keys),
    groups,
  };
}

const localKeys = localEnvKeys();
const vercel = vercelEnvKeys();
const result = {
  generatedAt: new Date().toISOString(),
  local: auditSource('local', localKeys),
  vercel: auditSource('vercel', vercel.keys, vercel.error),
};

console.log(JSON.stringify(result, null, 2));

if (vercel.ok && !result.vercel.capabilities.telegramVoice) {
  process.exitCode = 1;
}
