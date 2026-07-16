import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateText } from 'ai';
import { getAiModels, getAiOutputLimit, type AiFeature } from '@/lib/ai-policy';
import { recordAiUsage } from '@/lib/ai-usage';

const activeGeminiModels = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.0-flash'];
const vercelGatewayKey = 'vercel-ai-gateway';

function getVercelGatewayModels(feature: AiFeature) {
  return getAiModels(feature, 'gateway');
}

export function getConfiguredLlmKey() {
  const explicitKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const hasGateway = Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

  return hasGateway ? vercelGatewayKey : explicitKey;
}

function isOpenRouterKey(apiKey: string) {
  return apiKey.startsWith('sk-or-');
}

function getOpenRouterModels(feature: AiFeature) {
  return getAiModels(feature, 'openrouter');
}

export function getGeminiModelName(feature: AiFeature = 'financial-chat') {
  const configuredModel = feature === 'structured' || feature === 'audio-transcription'
    ? process.env.GEMINI_STRUCTURED_MODEL || 'gemini-2.5-flash-lite'
    : process.env.GEMINI_MODEL || process.env.GOOGLE_AI_MODEL || '';

  if (configuredModel && activeGeminiModels.includes(configuredModel)) {
    return configuredModel;
  }

  return activeGeminiModels[0];
}

function getGeminiModel(apiKey: string, modelName = getGeminiModelName()) {
  const ai = new GoogleGenerativeAI(apiKey);

  return ai.getGenerativeModel({ model: modelName });
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type LlmChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LlmChatResult = {
  text: string;
  provider: 'vercel-ai-gateway' | 'openrouter' | 'gemini';
  model: string;
};

async function generateVercelGatewayChat({
  system,
  messages,
  feature,
}: {
  system: string;
  messages: LlmChatMessage[];
  feature: AiFeature;
}): Promise<LlmChatResult> {
  let lastError: unknown;

  for (const model of getVercelGatewayModels(feature)) {
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model,
        system,
        messages,
        temperature: 0.45,
        maxOutputTokens: getAiOutputLimit(feature),
        providerOptions: { gateway: { tags: [`feature:${feature}`] } },
      });

      if (!result.text.trim()) throw new Error('Vercel AI Gateway no devolvió texto.');

      recordAiUsage({ feature, provider: 'vercel-ai-gateway', model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, totalTokens: result.usage.totalTokens, latencyMs: Date.now() - startedAt, success: true });
      return { text: result.text.trim(), provider: 'vercel-ai-gateway', model };
    } catch (error) {
      recordAiUsage({ feature, provider: 'vercel-ai-gateway', model, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

async function generateOpenRouterText(apiKey: string, prompt: string, feature: AiFeature) {
  let lastError: unknown;

  for (const model of getOpenRouterModels(feature)) {
    const startedAt = Date.now();
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero.vercel.app',
          'X-OpenRouter-Title': 'Virafi',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: getAiOutputLimit(feature),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error?.message || `OpenRouter respondió ${response.status}.`);
      }

      const text = payload.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('OpenRouter no devolvió texto.');
      }

      const usage = payload.usage || {};
      recordAiUsage({ feature, provider: 'openrouter', model, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens, costUsd: usage.cost, latencyMs: Date.now() - startedAt, success: true });
      return String(text);
    } catch (error) {
      recordAiUsage({ feature, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

async function generateOpenRouterChat({
  apiKey,
  system,
  messages,
  feature,
}: {
  apiKey: string;
  system: string;
  messages: LlmChatMessage[];
  feature: AiFeature;
}): Promise<LlmChatResult> {
  let lastError: unknown;

  for (const model of getOpenRouterModels(feature)) {
    const startedAt = Date.now();
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero.vercel.app',
          'X-OpenRouter-Title': 'Virafi',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            ...messages.map((message) => ({ role: message.role, content: message.content })),
          ],
          temperature: 0.45,
          max_tokens: getAiOutputLimit(feature),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error?.message || `OpenRouter respondió ${response.status}.`);
      }

      const text = String(payload.choices?.[0]?.message?.content || '').trim();

      if (!text) throw new Error('OpenRouter no devolvió texto.');

      const usage = payload.usage || {};
      recordAiUsage({ feature, provider: 'openrouter', model, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens, costUsd: usage.cost, latencyMs: Date.now() - startedAt, success: true });
      return { text, provider: 'openrouter', model };
    } catch (error) {
      recordAiUsage({ feature, provider: 'openrouter', model, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateLlmChat({
  apiKey,
  system,
  messages,
  feature = 'financial-chat',
}: {
  apiKey: string;
  system: string;
  messages: LlmChatMessage[];
  feature?: AiFeature;
}): Promise<LlmChatResult> {
  const cleanMessages = messages
    .filter((message) => message.content.trim())
    .slice(-14)
    .map((message) => ({ ...message, content: message.content.slice(0, 4000) }));

  if (!cleanMessages.length) throw new Error('No hay mensajes para enviar al LLM.');

  if (apiKey === vercelGatewayKey) {
    return generateVercelGatewayChat({ system, messages: cleanMessages, feature });
  }

  if (isOpenRouterKey(apiKey)) {
    return generateOpenRouterChat({ apiKey, system, messages: cleanMessages, feature });
  }

  const preferredModel = getGeminiModelName(feature);
  const models = [preferredModel, ...activeGeminiModels.filter((model) => model !== preferredModel)];
  let lastError: unknown;

  for (const modelName of models) {
    const startedAt = Date.now();
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: modelName,
        systemInstruction: system,
      });
      const response = await model.generateContent({
        contents: cleanMessages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: { maxOutputTokens: getAiOutputLimit(feature) },
      });
      const text = response.response.text().trim();

      if (!text) throw new Error('Gemini no devolvió texto.');

      const usage = response.response.usageMetadata;
      recordAiUsage({ feature, provider: 'gemini', model: modelName, inputTokens: usage?.promptTokenCount, outputTokens: usage?.candidatesTokenCount, totalTokens: usage?.totalTokenCount, latencyMs: Date.now() - startedAt, success: true });
      return { text, provider: 'gemini', model: modelName };
    } catch (error) {
      recordAiUsage({ feature, provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiText(apiKey: string, prompt: string, feature: AiFeature = 'structured') {
  if (apiKey === vercelGatewayKey) {
    const result = await generateVercelGatewayChat({
      system: 'Follow the user instructions exactly. Return only the requested format.',
      messages: [{ role: 'user', content: prompt }],
      feature,
    });

    return result.text;
  }

  if (isOpenRouterKey(apiKey)) {
    return generateOpenRouterText(apiKey, prompt, feature);
  }

  const preferredModel = getGeminiModelName(feature);
  const fallbackModels = activeGeminiModels;
  const models = [preferredModel, ...fallbackModels.filter((model) => model !== preferredModel)];
  let lastError: unknown;

  for (const modelName of models) {
    const startedAt = Date.now();
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: getAiOutputLimit(feature) },
      });

      const usage = response.response.usageMetadata;
      recordAiUsage({ feature, provider: 'gemini', model: modelName, inputTokens: usage?.promptTokenCount, outputTokens: usage?.candidatesTokenCount, totalTokens: usage?.totalTokenCount, latencyMs: Date.now() - startedAt, success: true });
      return response.response.text();
    } catch (error) {
      recordAiUsage({ feature, provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiParts(apiKey: string, parts: GeminiPart[]) {
  const preferredModel = getGeminiModelName('audio-transcription');
  const fallbackModels = activeGeminiModels;
  const models = [preferredModel, ...fallbackModels.filter((model) => model !== preferredModel)];
  let lastError: unknown;

  for (const modelName of models) {
    const startedAt = Date.now();
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: getAiOutputLimit('audio-transcription') },
      });

      const usage = response.response.usageMetadata;
      recordAiUsage({ feature: 'audio-transcription', provider: 'gemini', model: modelName, inputTokens: usage?.promptTokenCount, outputTokens: usage?.candidatesTokenCount, totalTokens: usage?.totalTokenCount, latencyMs: Date.now() - startedAt, success: true });
      return response.response.text();
    } catch (error) {
      recordAiUsage({ feature: 'audio-transcription', provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export function extraerJson(texto: string) {
  return texto
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}
