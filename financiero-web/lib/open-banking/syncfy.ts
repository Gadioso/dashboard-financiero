const syncfyBaseUrls = {
  sandbox: 'https://opendata-api.syncfy.com/v1',
  production: 'https://opendata-api.syncfy.com/v1',
} as const;

type SyncfyEnvironment = keyof typeof syncfyBaseUrls;

type SyncfyEnvelope<T> = {
  rid?: string;
  code?: number;
  errors?: unknown;
  status?: boolean;
  message?: string | null;
  response: T;
};

export type SyncfyPull = {
  id_credential: string;
  id_job: string;
  id_job_uuid?: string;
};

export type SyncfyJobStatus = {
  code?: number;
  message?: string | null;
};

export type SyncfyUser = {
  id_user: string;
  id_external?: string | null;
  name: string;
  dt_create?: number;
  dt_modify?: number | null;
};

export type SyncfySession = {
  token: string;
};

export type SyncfyAccount = {
  id_account?: string;
  id_credential?: string;
  name?: string | null;
  number?: string | null;
  type?: string | null;
  currency?: string | null;
  balance?: number | string | null;
  balance_available?: number | string | null;
  [key: string]: unknown;
};

export type SyncfyTransaction = {
  id_transaction?: string;
  id_account?: string;
  id_credential?: string;
  description?: string | null;
  concept?: string | null;
  reference?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  dt_transaction?: number | string | null;
  dt_accounting?: number | string | null;
  dt_refresh?: number | string | null;
  is_disable?: number | boolean | null;
  is_deleted?: number | boolean | null;
  keywords?: string[] | null;
  attachments?: Array<{
    id_attachment?: string;
    id_attachment_type?: string;
    is_valid?: number | boolean;
    file?: string | null;
    mime?: string | null;
    url?: string | null;
  }> | null;
  extra?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type SyncfyAttachment = {
  id_attachment?: string;
  id_attachment_type?: string;
  id_transaction?: string | null;
  id_credential?: string | null;
  id_site?: string | null;
  id_user?: string | null;
  is_valid?: number | boolean | null;
  file?: string | null;
  mime?: string | null;
  url?: string | null;
  dt_refresh?: number | string | null;
  dt_create?: number | string | null;
  keywords?: string[] | null;
  extra?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type SyncfyCountry = {
  id_country: string;
  name: string;
  code: string;
};

export type SyncfySiteCredential = {
  name: string;
  required: boolean;
  type: string;
  label: string;
  validation?: unknown;
  token?: boolean;
  options?: unknown;
};

export type SyncfySite = {
  id_site: string;
  id_site_organization?: string;
  id_site_organization_type?: string;
  id_site_type?: string;
  is_business?: number;
  is_personal?: number;
  version?: number;
  name: string;
  credentials?: SyncfySiteCredential[] | null;
  endpoint?: string;
};

export type SyncfySiteOrganization = {
  id_site_organization: string;
  id_site_organization_type?: string;
  id_country?: string;
  name: string;
  sites: Array<{
    id_site: string;
    id_site_type?: string;
    name: string;
    credentials?: SyncfySiteCredential[] | null;
  }>;
};

function getSyncfyEnvironment(): SyncfyEnvironment {
  const env = process.env.SYNCFY_ENV || 'sandbox';

  return env === 'production' ? 'production' : 'sandbox';
}

function getSyncfyCredentials() {
  const apiKey = process.env.SYNCFY_API_KEY || '';

  if (!apiKey.trim()) {
    throw new Error('Falta configurar SYNCFY_API_KEY.');
  }

  return {
    apiKey,
    baseUrl: process.env.SYNCFY_BASE_URL || syncfyBaseUrls[getSyncfyEnvironment()],
  };
}

async function parseSyncfyResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as SyncfyEnvelope<T>;

  if (!response.ok || data.status === false) {
    const message = data.message || `Syncfy rechazo la solicitud (${response.status}).`;
    throw new Error(message);
  }

  return data.response;
}

async function syncfyGet<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const { apiKey, baseUrl } = getSyncfyCredentials();
  const url = new URL(`${baseUrl}${path}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `API_KEY api_key=${apiKey}`,
      Accept: 'application/json',
    },
  });
  return parseSyncfyResponse<T>(response);
}

async function syncfyPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const { apiKey, baseUrl } = getSyncfyCredentials();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `API_KEY api_key=${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseSyncfyResponse<T>(response);
}

export async function syncfySessionGet<T>(
  token: string,
  path: string,
  params?: Record<string, string | number | undefined | null>
): Promise<T> {
  const { baseUrl } = getSyncfyCredentials();
  const url = new URL(`${baseUrl}${path}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  return parseSyncfyResponse<T>(response);
}

async function syncfySessionPut<T>(token: string, path: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { baseUrl } = getSyncfyCredentials();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseSyncfyResponse<T>(response);
}

export async function listSyncfyCountries() {
  return syncfyGet<SyncfyCountry[]>('/catalogues/countries');
}

export async function listSyncfyCatalogueSites(country = 'MX') {
  return syncfyGet<SyncfySite[]>('/catalogues/sites', { country });
}

export async function listSyncfySites(country = 'MX') {
  return syncfyGet<SyncfySiteOrganization[]>('/sites', { country });
}

export async function createSyncfyUser({ name, idExternal }: { name: string; idExternal: string }) {
  return syncfyPost<SyncfyUser>('/users', {
    name,
    id_external: idExternal,
  });
}

export async function createSyncfySession(idUser: string) {
  return syncfyPost<SyncfySession>('/sessions', {
    id_user: idUser,
  });
}

export async function listSyncfyAccounts(token: string, params?: { idCredential?: string | null; limit?: number }) {
  return syncfySessionGet<SyncfyAccount[]>(token, '/accounts', {
    id_credential: params?.idCredential || undefined,
    limit: params?.limit || 500,
  });
}

export async function listSyncfyTransactions(token: string, params?: { idCredential?: string | null; limit?: number }) {
  return syncfySessionGet<SyncfyTransaction[]>(token, '/transactions', {
    id_credential: params?.idCredential || undefined,
    limit: params?.limit || 500,
  });
}

export async function listSyncfyAttachments(token: string, params?: { idCredential?: string | null; limit?: number }) {
  return syncfySessionGet<SyncfyAttachment[]>(token, '/attachments', {
    id_credential: params?.idCredential || undefined,
    limit: params?.limit || 5_000,
  });
}

export async function getSyncfyAttachmentExtra(token: string, idAttachment: string) {
  const encodedId = encodeURIComponent(idAttachment);

  try {
    return await syncfySessionGet<Record<string, unknown>>(token, `/attachment/${encodedId}/extra`);
  } catch (error) {
    // Some Syncfy deployments expose the same resource with the plural path.
    // Retrying this documented variant keeps the fiscal importer compatible
    // without ever handling the XML/CIEC outside Syncfy's session.
    try {
      return await syncfySessionGet<Record<string, unknown>>(token, `/attachments/${encodedId}/extra`);
    } catch {
      throw error;
    }
  }
}

export async function requestSyncfyCredentialPull(token: string, idCredential: string) {
  return syncfySessionPut<SyncfyPull>(token, `/credentials/${encodeURIComponent(idCredential)}/pulls`);
}

export async function getSyncfyJobStatus(token: string, idJob: string) {
  return syncfySessionGet<SyncfyJobStatus[]>(token, `/jobs/${encodeURIComponent(idJob)}/status`);
}

export async function waitForSyncfyPull(token: string, idJob: string, options?: { attempts?: number; intervalMs?: number }) {
  const attempts = Math.max(1, Math.min(options?.attempts || 10, 20));
  const intervalMs = Math.max(250, Math.min(options?.intervalMs || 1_500, 5_000));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statuses = await getSyncfyJobStatus(token, idJob);
    const latest = statuses.at(-1);
    const code = Number(latest?.code || 0);

    if ([200, 201, 202, 203, 204, 205, 206].includes(code)) return { completed: true, code };
    if (code >= 400) throw new Error(latest?.message || `Syncfy no pudo actualizar el banco (código ${code}).`);

    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { completed: false, code: 0 };
}
