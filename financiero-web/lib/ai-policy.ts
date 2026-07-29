export type AiFeature =
  | 'financial-chat'
  | 'financial-agent'
  | 'financial-attachment'
  | 'financial-import'
  | 'structured'
  | 'dashboard-analysis'
  | 'audio-transcription';

const outputLimits: Record<AiFeature, number> = {
  'financial-chat': 800,
  'financial-agent': 800,
  'financial-attachment': 1_200,
  'financial-import': 8_000,
  structured: 350,
  'dashboard-analysis': 600,
  'audio-transcription': 1_200,
};

export function getAiOutputLimit(feature: AiFeature) {
  const envName = `AI_${feature.replaceAll('-', '_').toUpperCase()}_MAX_OUTPUT_TOKENS`;
  const configured = Number(process.env[envName]);

  return Number.isFinite(configured) && configured >= 100
    ? Math.min(Math.round(configured), feature === 'financial-import' ? 12_000 : 2_000)
    : outputLimits[feature];
}

export function shouldUseIntentLlm() {
  return process.env.AI_INTENT_LLM_ENABLED === 'true';
}
