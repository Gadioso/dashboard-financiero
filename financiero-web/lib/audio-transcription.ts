import { generateGeminiParts } from '@/lib/gemini';

type TranscriptionProvider = 'openrouter' | 'openai' | 'gemini';

type AudioTranscriptionInput = {
  apiKey?: string;
  geminiApiKey?: string;
  openRouterApiKey?: string;
  openAiApiKey?: string;
  audio: ArrayBuffer;
  mimeType: string;
  fileName?: string;
};

function cleanTranscript(text: string) {
  return text.trim().replace(/^["“]|["”]$/g, '').trim();
}

function audioExtensionForMimeType(mimeType: string) {
  if (/ogg|opus/i.test(mimeType)) return 'ogg';
  if (/webm/i.test(mimeType)) return 'webm';
  if (/wav/i.test(mimeType)) return 'wav';
  if (/m4a|mp4/i.test(mimeType)) return 'm4a';

  return 'mp3';
}

function openRouterAudioFormat(mimeType: string, fileName?: string) {
  const extension = fileName?.split('.').pop()?.toLowerCase();

  if (extension && ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'flac', 'ogg'].includes(extension)) {
    return extension === 'mpeg' || extension === 'mpga' ? 'mp3' : extension;
  }

  return audioExtensionForMimeType(mimeType);
}

async function transcribirConOpenRouter({
  apiKey,
  audio,
  mimeType,
  fileName,
}: {
  apiKey: string;
  audio: ArrayBuffer;
  mimeType: string;
  fileName?: string;
}) {
  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard-financiero-chi.vercel.app',
      'X-Title': 'Virafi',
    },
    body: JSON.stringify({
      input_audio: {
        data: Buffer.from(audio).toString('base64'),
        format: openRouterAudioFormat(mimeType, fileName),
      },
      model: process.env.OPENROUTER_TRANSCRIPTION_MODEL || 'openai/whisper-large-v3',
      language: 'es',
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => '') } })) as {
    text?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenRouter transcripción respondió ${response.status}.`);
  }

  const transcript = cleanTranscript(payload.text || '');

  if (!transcript) {
    throw new Error('OpenRouter no devolvió texto transcrito.');
  }

  return transcript;
}

async function transcribirConOpenAI({
  apiKey,
  audio,
  mimeType,
  fileName,
}: {
  apiKey: string;
  audio: ArrayBuffer;
  mimeType: string;
  fileName?: string;
}) {
  const formData = new FormData();
  const uploadName = fileName || `telegram-audio.${audioExtensionForMimeType(mimeType)}`;

  formData.append('file', new Blob([audio], { type: mimeType || 'audio/mpeg' }), uploadName);
  formData.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1');
  formData.append('language', 'es');
  formData.append('response_format', 'json');
  formData.append(
    'prompt',
    'Audio financiero en español. Puede mencionar gastos, ingresos, abonos a tarjeta, cantidades en pesos, bancos, categorías y fechas.'
  );

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(25_000),
  });

  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => '') } })) as {
    text?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI transcripción respondió ${response.status}.`);
  }

  const transcript = cleanTranscript(payload.text || '');

  if (!transcript) {
    throw new Error('OpenAI no devolvió texto transcrito.');
  }

  return transcript;
}

async function transcribirConGemini({
  apiKey,
  audio,
  mimeType,
}: {
  apiKey: string;
  audio: ArrayBuffer;
  mimeType: string;
}) {
  const base64Audio = Buffer.from(audio).toString('base64');
  const text = await generateGeminiParts(apiKey, [
    {
      inlineData: {
        mimeType,
        data: base64Audio,
      },
    },
    {
      text: [
        'Transcribe este audio en español para un asistente financiero.',
        'Devuelve solamente el texto que dijo la persona.',
        'No clasifiques, no expliques y no agregues formato.',
        'Si hay cantidades, conserva los números y la moneda cuando sea clara.',
      ].join(' '),
    },
  ]);

  const transcript = cleanTranscript(text);

  if (!transcript) {
    throw new Error('Gemini no devolvió texto transcrito.');
  }

  return transcript;
}

export async function transcribirAudioFinanciero({
  apiKey,
  geminiApiKey,
  openRouterApiKey,
  openAiApiKey,
  audio,
  mimeType,
  fileName,
}: AudioTranscriptionInput) {
  const providers: Array<{ name: TranscriptionProvider; run: () => Promise<string> }> = [];
  const resolvedGeminiKey = geminiApiKey || apiKey || '';

  if (openRouterApiKey) {
    providers.push({
      name: 'openrouter',
      run: () => transcribirConOpenRouter({ apiKey: openRouterApiKey, audio, mimeType, fileName }),
    });
  }

  if (openAiApiKey) {
    providers.push({
      name: 'openai',
      run: () => transcribirConOpenAI({ apiKey: openAiApiKey, audio, mimeType, fileName }),
    });
  }

  if (resolvedGeminiKey) {
    providers.push({
      name: 'gemini',
      run: () => transcribirConGemini({ apiKey: resolvedGeminiKey, audio, mimeType }),
    });
  }

  if (!providers.length) {
    throw new Error('Falta configurar OPENROUTER_API_KEY, OPENAI_API_KEY o GEMINI_API_KEY para transcribir audio.');
  }

  const failures: string[] = [];

  for (const provider of providers) {
    try {
      return await provider.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Error desconocido.');
      failures.push(`${provider.name}: ${message}`);
      console.error(`Falló transcripción con ${provider.name}:`, error);
    }
  }

  throw new Error(`No pude transcribir el audio con proveedores disponibles. ${failures.join(' | ')}`);
}
