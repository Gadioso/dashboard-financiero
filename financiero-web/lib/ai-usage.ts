import type { AiFeature } from '@/lib/ai-policy';

type AiUsageInput = {
  feature: AiFeature;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  latencyMs: number;
  success: boolean;
};

export function recordAiUsage(input: AiUsageInput) {
  console.info('[ai-usage]', JSON.stringify({
    ...input,
    inputTokens: input.inputTokens || 0,
    outputTokens: input.outputTokens || 0,
    totalTokens: input.totalTokens || 0,
    costUsd: input.costUsd || 0,
    recordedAt: new Date().toISOString(),
  }));
}
