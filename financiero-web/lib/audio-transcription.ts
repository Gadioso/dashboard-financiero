import { generateGeminiParts } from '@/lib/gemini';

type AudioTranscriptionInput = {
  apiKey?: string;
  geminiApiKey?: string;
  audio: ArrayBuffer;
  mimeType: string;
};

function cleanTranscript(text: string) {
  return text.trim().replace(/^["“]|["”]$/g, '').trim();
}

export async function transcribirAudioFinanciero({
  apiKey,
  geminiApiKey,
  audio,
  mimeType,
}: AudioTranscriptionInput) {
  const resolvedApiKey = geminiApiKey || apiKey || '';
  if (!resolvedApiKey) throw new Error('GEMINI_API_KEY no está configurada para transcribir audio.');

  const text = await generateGeminiParts(resolvedApiKey, [
    {
      inlineData: {
        mimeType,
        data: Buffer.from(audio).toString('base64'),
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
  if (!transcript) throw new Error('Gemini no devolvió texto transcrito.');
  return transcript;
}
