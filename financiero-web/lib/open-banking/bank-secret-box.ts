import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getBankTokenKey() {
  const raw = process.env.BANK_TOKEN_ENCRYPTION_KEY || process.env.GMAIL_TOKEN_ENCRYPTION_KEY || '';

  if (!raw.trim()) {
    throw new Error('Falta configurar BANK_TOKEN_ENCRYPTION_KEY o GMAIL_TOKEN_ENCRYPTION_KEY para cifrar tokens bancarios.');
  }

  return createHash('sha256').update(raw).digest();
}

export function encryptBankSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getBankTokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptBankSecret(value?: string | null) {
  if (!value) return null;

  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':');

  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Formato de token bancario cifrado invalido.');
  }

  const decipher = createDecipheriv('aes-256-gcm', getBankTokenKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
