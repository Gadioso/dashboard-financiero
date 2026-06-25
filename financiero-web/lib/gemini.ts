import { GoogleGenerativeAI } from '@google/generative-ai';

const activeGeminiModels = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

export function getGeminiModelName() {
  const configuredModel = process.env.GEMINI_MODEL || process.env.GOOGLE_AI_MODEL || '';

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

export async function generateGeminiText(apiKey: string, prompt: string) {
  const preferredModel = getGeminiModelName();
  const fallbackModels = activeGeminiModels;
  const models = [preferredModel, ...fallbackModels.filter((model) => model !== preferredModel)];
  let lastError: unknown;

  for (const modelName of models) {
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent(prompt);

      return response.response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function generateGeminiParts(apiKey: string, parts: GeminiPart[]) {
  const preferredModel = getGeminiModelName();
  const fallbackModels = activeGeminiModels;
  const models = [preferredModel, ...fallbackModels.filter((model) => model !== preferredModel)];
  let lastError: unknown;

  for (const modelName of models) {
    try {
      const model = getGeminiModel(apiKey, modelName);
      const response = await model.generateContent({ contents: [{ role: 'user', parts }] });

      return response.response.text();
    } catch (error) {
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
