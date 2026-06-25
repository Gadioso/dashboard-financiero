import { generateGeminiParts } from '@/lib/gemini';

export async function transcribirAudioFinanciero({
  apiKey,
  audio,
  mimeType,
}: {
  apiKey: string;
  audio: ArrayBuffer;
  mimeType: string;
}) {
  if (!apiKey) {
    throw new Error('Falta configurar GEMINI_API_KEY para transcribir audio.');
  }

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

  const transcript = text.trim().replace(/^["“]|["”]$/g, '').trim();

  if (!transcript) {
    throw new Error('No pude transcribir el audio.');
  }

  return transcript;
}
