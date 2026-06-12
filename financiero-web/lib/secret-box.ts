import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getKey() {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || '';

  if (!raw.trim()) {
    throw new Error('Falta configurar GMAIL_TOKEN_ENCRYPTION_KEY para cifrar tokens de Gmail.');
  }

  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value?: string | null) {
  if (!value) return null;

  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':');

  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Formato de token cifrado inválido.');
  }

  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
