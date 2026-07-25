import { createHmac, timingSafeEqual } from 'node:crypto';

type JwtHeader = {
  alg?: unknown;
};

type JwtPayload = {
  exp?: unknown;
  nbf?: unknown;
};

function decodeJsonPart<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function signatureKeyBytes(configuredKey: string) {
  const trimmed = configuredKey.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { k?: unknown };
    if (typeof parsed.k === 'string' && parsed.k.trim()) {
      return Buffer.from(parsed.k.trim(), 'base64url');
    }
  } catch {
    // The recommended env value is the JWK `k` field, not the complete JSON.
  }

  try {
    return Buffer.from(trimmed, 'base64url');
  } catch {
    return null;
  }
}

export function verifySyncfyRequestSignature(signature: string, configuredKey: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = signature.trim().split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return false;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart<JwtHeader>(encodedHeader);
  const payload = decodeJsonPart<JwtPayload>(encodedPayload);
  const algorithms: Record<string, string> = {
    HS256: 'sha256',
    HS384: 'sha384',
    HS512: 'sha512',
  };
  const algorithm = typeof header?.alg === 'string' ? algorithms[header.alg] : null;
  const key = signatureKeyBytes(configuredKey);

  if (!algorithm || !key?.length || !payload) return false;

  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return false;
  }

  const expectedSignature = createHmac(algorithm, key)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    return false;
  }

  if (typeof payload.exp === 'number' && nowSeconds >= payload.exp) return false;
  if (typeof payload.nbf === 'number' && nowSeconds < payload.nbf) return false;

  return true;
}

export function hasValidSyncfySignature(request: Request, configuredKey: string) {
  const signature = request.headers.get('request-signature') || '';
  return Boolean(signature && configuredKey && verifySyncfyRequestSignature(signature, configuredKey));
}
