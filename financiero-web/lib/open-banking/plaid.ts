const plaidBaseUrls = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
} as const;

type PlaidEnvironment = keyof typeof plaidBaseUrls;

function getPlaidEnvironment(): PlaidEnvironment {
  const env = process.env.PLAID_ENV || 'sandbox';

  return env === 'development' || env === 'production' ? env : 'sandbox';
}

function getPlaidCredentials() {
  const clientId = process.env.PLAID_CLIENT_ID || '';
  const secret = process.env.PLAID_SECRET || '';

  if (!clientId || !secret) {
    throw new Error('Faltan PLAID_CLIENT_ID y PLAID_SECRET.');
  }

  return { clientId, secret, baseUrl: plaidBaseUrls[getPlaidEnvironment()] };
}

async function plaidPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const { clientId, secret, baseUrl } = getPlaidCredentials();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': clientId,
      'PLAID-SECRET': secret,
      'Plaid-Version': '2020-09-14',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok) {
    const message = typeof data?.error_message === 'string' ? data.error_message : 'Plaid rechazo la solicitud.';
    throw new Error(message);
  }

  return data as T;
}

export async function createPlaidLinkToken({
  profileId,
  email,
}: {
  profileId: string;
  email?: string | null;
}) {
  return plaidPost<{
    link_token: string;
    expiration: string;
    request_id: string;
  }>('/link/token/create', {
    client_name: 'Dashboard Financiero',
    language: 'es',
    country_codes: ['US'],
    products: ['transactions'],
    user: {
      client_user_id: profileId,
      email_address: email || undefined,
    },
  });
}

export async function exchangePlaidPublicToken(publicToken: string) {
  return plaidPost<{
    access_token: string;
    item_id: string;
    request_id: string;
  }>('/item/public_token/exchange', {
    public_token: publicToken,
  });
}
