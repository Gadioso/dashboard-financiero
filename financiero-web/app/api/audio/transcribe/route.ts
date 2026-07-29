import { NextResponse } from 'next/server';
import { transcribirAudioFinanciero } from '@/lib/audio-transcription';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const maxAudioBytes = 12 * 1024 * 1024;
const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

export async function POST(request: Request) {
  try {
    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get('audio');

    if (!(audio instanceof File)) {
      return NextResponse.json({ success: false, error: 'No recibí audio para transcribir.' }, { status: 400 });
    }

    if (audio.size <= 0) {
      return NextResponse.json({ success: false, error: 'El audio llegó vacío.' }, { status: 400 });
    }

    if (audio.size > maxAudioBytes) {
      return NextResponse.json({ success: false, error: 'El audio es demasiado grande. Intenta con una nota más corta.' }, { status: 413 });
    }

    const transcript = await transcribirAudioFinanciero({
      geminiApiKey: googleApiKey,
      audio: await audio.arrayBuffer(),
      mimeType: audio.type || 'audio/webm',
    });

    return NextResponse.json({ success: true, transcript });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude transcribir el audio.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
