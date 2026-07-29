import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  extractWhatsAppInboundTexts,
  getWhatsAppChannelMode,
  verifyWhatsAppChallenge,
  verifyWhatsAppSignature,
  whatsappAssistantPolicyGate,
} from '../lib/messaging/whatsapp-cloud.ts';

test('verifies the Meta webhook challenge without leaking the verify token', () => {
  assert.equal(verifyWhatsAppChallenge({
    mode: 'subscribe',
    verifyToken: 'private-token',
    token: 'private-token',
    challenge: 'challenge-value',
  }), 'challenge-value');
  assert.equal(verifyWhatsAppChallenge({
    mode: 'subscribe',
    verifyToken: 'private-token',
    token: 'wrong-token',
    challenge: 'challenge-value',
  }), null);
});

test('validates webhook payloads with the Meta app secret', () => {
  const rawBody = JSON.stringify({ object: 'whatsapp_business_account' });
  const appSecret = 'test-app-secret';
  const signature = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  assert.equal(verifyWhatsAppSignature({ rawBody, appSecret, signatureHeader: `sha256=${signature}` }), true);
  assert.equal(verifyWhatsAppSignature({ rawBody: `${rawBody} `, appSecret, signatureHeader: `sha256=${signature}` }), false);
});

test('extracts only usable inbound text messages', () => {
  const messages = extractWhatsAppInboundTexts({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'phone-1' },
          contacts: [{ wa_id: '5215550000000', profile: { name: 'Diego' } }],
          messages: [
            { id: 'wamid.1', from: '5215550000000', timestamp: '1785000000', type: 'text', text: { body: '¿Cómo voy este mes?' } },
            { id: 'wamid.2', from: '5215550000000', type: 'image' },
          ],
        },
      }],
    }],
  });

  assert.deepEqual(messages, [{
    messageId: 'wamid.1',
    from: '5215550000000',
    text: '¿Cómo voy este mes?',
    timestamp: '1785000000',
    senderName: 'Diego',
    phoneNumberId: 'phone-1',
  }]);
});

test('requires two independent gates before enabling the assistant', () => {
  assert.equal(getWhatsAppChannelMode('unexpected'), 'disabled');
  assert.equal(whatsappAssistantPolicyGate({ mode: 'assistant', policyApproved: 'false' }), false);
  assert.equal(whatsappAssistantPolicyGate({ mode: 'setup', policyApproved: 'true' }), false);
  assert.equal(whatsappAssistantPolicyGate({ mode: 'assistant', policyApproved: 'true' }), true);
});
