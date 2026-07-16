export type AiFeature = 'financial-chat' | 'financial-agent' | 'financial-attachment' | 'structured' | 'dashboard-analysis' | 'audio-transcription';

const defaults: Record<AiFeature, string[]> = {
  'financial-chat': ['openai/gpt-5-mini'],
  'financial-agent': ['openai/gpt-5-mini'],
  'financial-attachment': ['google/gemini-2.5-flash-lite'],
  structured: ['google/gemini-2.5-flash-lite', 'openai/gpt-5-mini'],
  'dashboard-analysis': ['openai/gpt-5-mini', 'google/gemini-2.5-flash-lite'],
  'audio-transcription': ['google/gemini-2.5-flash-lite'],
};

const outputLimits: Record<AiFeature, number> = {
  'financial-chat': 800,
  'financial-agent': 800,
  'financial-attachment': 1_200,
  structured: 350,
  'dashboard-analysis': 600,
  'audio-transcription': 1_200,
};

function splitModels(value?: string) {
  return String(value || '')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model && model !== 'openrouter/auto');
}

function unique(models: string[]) {
  return models.filter((model, index) => models.indexOf(model) === index);
}

function isPremiumModel(model: string) {
  return /(?:gpt-5\.(?:2|3|4)|claude-(?:sonnet|opus))/i.test(model);
}

function featureEnv(feature: AiFeature, provider: 'gateway' | 'openrouter') {
  const suffix = feature.replaceAll('-', '_').toUpperCase();
  return process.env[`${provider === 'gateway' ? 'AI_GATEWAY' : 'OPENROUTER'}_${suffix}_MODELS`];
}

export function getAiModels(feature: AiFeature, provider: 'gateway' | 'openrouter') {
  const featureModels = splitModels(featureEnv(feature, provider));
  const allowPremium = process.env.AI_ALLOW_PREMIUM_FALLBACK === 'true';
  const legacyModels = splitModels(provider === 'gateway'
    ? process.env.AI_GATEWAY_MODEL || process.env.VERCEL_AI_GATEWAY_MODEL
    : process.env.OPENROUTER_MODELS || process.env.OPENROUTER_MODEL)
    .filter((model) => allowPremium || !isPremiumModel(model));
  const premiumModels = allowPremium
    ? splitModels(process.env.AI_PREMIUM_FALLBACK_MODELS)
    : [];

  return unique([
    ...featureModels,
    ...legacyModels,
    ...defaults[feature],
    ...premiumModels,
  ]);
}

export function getAiOutputLimit(feature: AiFeature) {
  const envName = `AI_${feature.replaceAll('-', '_').toUpperCase()}_MAX_OUTPUT_TOKENS`;
  const configured = Number(process.env[envName]);
  return Number.isFinite(configured) && configured >= 100
    ? Math.min(Math.round(configured), 2_000)
    : outputLimits[feature];
}

export function shouldUseIntentLlm() {
  return process.env.AI_INTENT_LLM_ENABLED === 'true';
}
