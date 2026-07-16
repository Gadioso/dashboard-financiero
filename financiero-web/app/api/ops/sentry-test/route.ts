import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';

  if (!cronSecret || getBearerToken(request) !== cronSecret) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { confirmation?: string };

  if (body.confirmation !== 'SENTRY_TEST') {
    return NextResponse.json({
      success: false,
      error: 'Falta confirmation="SENTRY_TEST".',
    }, { status: 400 });
  }

  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return NextResponse.json({ success: false, error: 'Sentry no está configurado.' }, { status: 503 });
  }

  const eventId = Sentry.captureException(new Error('Virafi Sentry integration test'));
  await Sentry.flush(2_000);

  return NextResponse.json({ success: true, eventId });
}
