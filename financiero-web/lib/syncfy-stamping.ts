type StampingReadiness = {
  ready: boolean;
  missing: string[];
};

function configuredTrue(name: string) {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

export function getSyncfyStampingReadiness(): StampingReadiness {
  const missing = [
    !configuredTrue('SYNCFY_STAMPING_PRODUCT_ENABLED') ? 'producto Stamping habilitado' : null,
    !process.env.SYNCFY_STAMPING_API_KEY?.trim() ? 'llave de Stamping' : null,
    !configuredTrue('SYNCFY_STAMPING_CSD_CONFIGURED') ? 'CSD configurado en Syncfy' : null,
    !process.env.SYNCFY_STAMPING_BASE_URL?.trim() ? 'URL base de Stamping' : null,
    !process.env.SYNCFY_STAMPING_ISSUE_PATH?.trim() ? 'endpoint de timbrado' : null,
    !process.env.SYNCFY_STAMPING_CANCEL_PATH?.trim() ? 'endpoint de cancelación' : null,
  ].filter((item): item is string => Boolean(item));
  return { ready: missing.length === 0, missing };
}

function endpoint(path: string) {
  const baseUrl = process.env.SYNCFY_STAMPING_BASE_URL?.trim() || '';
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== 'https:') throw new Error('La URL de Syncfy Stamping debe usar HTTPS.');
  return url;
}

async function stampingRequest(path: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const readiness = getSyncfyStampingReadiness();
  if (!readiness.ready) throw new Error(`Syncfy Stamping no está listo. Falta: ${readiness.missing.join(', ')}.`);
  const response = await fetch(endpoint(path), {
    method: 'POST',
    headers: {
      Authorization: `API_KEY api_key=${process.env.SYNCFY_STAMPING_API_KEY?.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || data.status === false) {
    const message = typeof data.message === 'string' ? data.message : `Syncfy Stamping rechazó la operación (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

export function issueSyncfyInvoice(payload: Record<string, unknown>, idempotencyKey: string) {
  return stampingRequest(process.env.SYNCFY_STAMPING_ISSUE_PATH || '', payload, idempotencyKey);
}

export function cancelSyncfyInvoice(providerId: string, payload: Record<string, unknown>, idempotencyKey: string) {
  const path = (process.env.SYNCFY_STAMPING_CANCEL_PATH || '').replace('{id}', encodeURIComponent(providerId));
  return stampingRequest(path, payload, idempotencyKey);
}

function findString(value: unknown, keys: Set<string>, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 8) return null;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keys.has(normalized) && (typeof nested === 'string' || typeof nested === 'number')) return String(nested);
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findString(nested, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

export function normalizeStampingResponse(value: unknown) {
  return {
    providerTransactionId: findString(value, new Set(['id', 'idinvoice', 'idcfdi', 'transactionid', 'providertransactionid'])),
    uuid: findString(value, new Set(['uuid', 'cfdiuuid', 'uuidfiscal']))?.toUpperCase() || null,
  };
}
