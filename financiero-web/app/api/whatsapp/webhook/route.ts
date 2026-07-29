import { NextResponse } from 'next/server';
import {
  extractWhatsAppInboundTexts,
  getWhatsAppChannelMode,
  verifyWhatsAppChallenge,
  verifyWhatsAppSignature,
  whatsappAssistantPolicyGate,
} from '@/lib/messaging/whatsapp-cloud';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = verifyWhatsAppChallenge({
    mode: url.searchParams.get('hub.mode'),
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
    challenge: url.searchParams.get('hub.challenge'),
    token: url.searchParams.get('hub.verify_token'),
  });

  if (!challenge) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const validSignature = verifyWhatsAppSignature({
    rawBody,
    signatureHeader: request.headers.get('x-hub-signature-256'),
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  });

  if (!validSignature) {
    return NextResponse.json({ success: false, error: 'Firma de webhook inválida.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody || '{}') as unknown;
  } catch {
    return NextResponse.json({ success: false, error: 'Payload de webhook inválido.' }, { status: 400 });
  }
  const messages = extractWhatsAppInboundTexts(payload);
  const mode = getWhatsAppChannelMode();

  // The endpoint is intentionally receive-only until Meta confirms that VirafIA's
  // financial assistant is ancillary under the March 2026 AI Provider terms.
  // A second explicit gate prevents an accidental production enablement.
  return NextResponse.json({
    success: true,
    acknowledged: true,
    received: messages.length,
    mode,
    assistantEnabled: whatsappAssistantPolicyGate({ mode }),
  });
}
