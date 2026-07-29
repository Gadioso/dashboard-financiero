import { GoogleGenerativeAI, type ResponseSchema } from '@google/generative-ai';
import { getAiOutputLimit, type AiFeature } from '@/lib/ai-policy';
import { recordAiUsage } from '@/lib/ai-usage';

const fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

export function getConfiguredLlmKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

export function getGeminiModelName(feature: AiFeature = 'financial-chat') {
  const featureVariable = `GEMINI_${feature.replaceAll('-', '_').toUpperCase()}_MODEL`;
  const economicalDefault = ['structured', 'financial-attachment', 'financial-import', 'audio-transcription'].includes(feature)
    ? 'gemini-2.5-flash-lite'
    : 'gemini-2.5-flash';

  return process.env[featureVariable]
    || (feature === 'structured' || feature === 'audio-transcription' ? process.env.GEMINI_STRUCTURED_MODEL : undefined)
    || process.env.GEMINI_MODEL
    || process.env.GOOGLE_AI_MODEL
    || economicalDefault;
}

function modelCandidates(feature: AiFeature) {
  const preferred = getGeminiModelName(feature);
  return [preferred, ...fallbackModels.filter((model) => model !== preferred)];
}

function getGeminiModel(apiKey: string, modelName: string, systemInstruction?: string) {
  const ai = new GoogleGenerativeAI(apiKey);
  return ai.getGenerativeModel({ model: modelName, ...(systemInstruction ? { systemInstruction } : {}) });
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type LlmChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type LlmChatResult = {
  text: string;
  provider: 'gemini';
  model: string;
};

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
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');

  const cleanMessages = messages
    .filter((message) => message.content.trim())
    .slice(-14)
    .map((message) => ({ ...message, content: message.content.slice(0, 4_000) }));

  if (!cleanMessages.length) throw new Error('No hay mensajes para enviar al LLM.');

  let lastError: unknown;

  for (const modelName of modelCandidates(feature)) {
    const startedAt = Date.now();
    try {
      const model = getGeminiModel(apiKey, modelName, system);
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
      recordAiUsage({
        feature,
        provider: 'gemini',
        model: modelName,
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return { text, provider: 'gemini', model: modelName };
    } catch (error) {
      recordAiUsage({ feature, provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiText(apiKey: string, prompt: string, feature: AiFeature = 'structured') {
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');
  let lastError: unknown;

  for (const modelName of modelCandidates(feature)) {
    const startedAt = Date.now();
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: getAiOutputLimit(feature) },
      });
      const usage = response.response.usageMetadata;
      recordAiUsage({
        feature,
        provider: 'gemini',
        model: modelName,
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return response.response.text();
    } catch (error) {
      recordAiUsage({ feature, provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiParts(apiKey: string, parts: GeminiPart[], feature: AiFeature = 'audio-transcription') {
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');
  let lastError: unknown;

  for (const modelName of modelCandidates(feature)) {
    const startedAt = Date.now();
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: getAiOutputLimit(feature) },
      });
      const usage = response.response.usageMetadata;
      recordAiUsage({
        feature,
        provider: 'gemini',
        model: modelName,
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return response.response.text();
    } catch (error) {
      recordAiUsage({ feature, provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiJsonParts(
  apiKey: string,
  parts: GeminiPart[],
  responseSchema: ResponseSchema,
  feature: AiFeature = 'structured',
) {
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada.');
  let lastError: unknown;

  for (const modelName of modelCandidates(feature)) {
    const startedAt = Date.now();
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: getAiOutputLimit(feature),
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0,
        },
      });
      const usage = response.response.usageMetadata;
      recordAiUsage({
        feature,
        provider: 'gemini',
        model: modelName,
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return response.response.text();
    } catch (error) {
      recordAiUsage({ feature, provider: 'gemini', model: modelName, latencyMs: Date.now() - startedAt, success: false });
      lastError = error;
    }
  }

  throw lastError;
}

export function extraerJson(texto: string) {
  return texto.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}
