import { createHmac, timingSafeEqual } from 'crypto';

export type WhatsAppChannelMode = 'disabled' | 'setup' | 'transactional' | 'assistant';

type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{ id?: string; status?: string; timestamp?: string; recipient_id?: string }>;
      };
    }>;
  }>;
};

export type WhatsAppInboundText = {
  messageId: string;
  from: string;
  text: string;
  timestamp: string | null;
  senderName: string | null;
  phoneNumberId: string | null;
};

export function getWhatsAppChannelMode(value = process.env.WHATSAPP_CHANNEL_MODE): WhatsAppChannelMode {
  return value === 'setup' || value === 'transactional' || value === 'assistant' ? value : 'disabled';
}

export function whatsappAssistantPolicyGate({
  mode = getWhatsAppChannelMode(),
  policyApproved = process.env.WHATSAPP_AI_POLICY_APPROVED,
}: {
  mode?: WhatsAppChannelMode;
  policyApproved?: string;
} = {}) {
  return mode === 'assistant' && policyApproved === 'true';
}

export function verifyWhatsAppChallenge({
  mode,
  verifyToken,
  challenge,
  token,
}: {
  mode: string | null;
  verifyToken: string;
  challenge: string | null;
  token: string | null;
}) {
  return mode === 'subscribe' && Boolean(verifyToken) && token === verifyToken && Boolean(challenge)
    ? challenge
    : null;
}

export function verifyWhatsAppSignature({
  rawBody,
  signatureHeader,
  appSecret,
}: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}) {
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;

  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function extractWhatsAppInboundTexts(payload: unknown): WhatsAppInboundText[] {
  const body = payload as WhatsAppWebhookPayload;
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];
  const messages: WhatsAppInboundText[] = [];

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value;
      const senderNames = new Map((value?.contacts || []).map((contact) => [
        String(contact.wa_id || ''),
        contact.profile?.name ? String(contact.profile.name) : null,
      ]));

      for (const message of value?.messages || []) {
        const from = String(message.from || '').trim();
        const text = String(message.text?.body || '').trim();
        const messageId = String(message.id || '').trim();
        if (message.type !== 'text' || !from || !text || !messageId) continue;
        messages.push({
          messageId,
          from,
          text: text.slice(0, 8_000),
          timestamp: message.timestamp ? String(message.timestamp) : null,
          senderName: senderNames.get(from) || null,
          phoneNumberId: value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null,
        });
      }
    }
  }

  return messages;
}

export async function sendWhatsAppText({
  to,
  text,
  accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || '',
}: {
  to: string;
  text: string;
  accessToken?: string;
  phoneNumberId?: string;
  graphApiVersion?: string;
}) {
  if (!accessToken || !phoneNumberId || !graphApiVersion) {
    throw new Error('WhatsApp Cloud API no está configurada por completo.');
  }

  const response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text.trim().slice(0, 4_096) },
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    throw new Error(`WhatsApp Cloud API respondió ${response.status}: ${payload.error?.message || 'error desconocido'}`);
  }
  return { messageId: payload.messages?.[0]?.id || null };
}
