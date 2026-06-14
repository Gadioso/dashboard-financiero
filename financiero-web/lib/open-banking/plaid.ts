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

export type PlaidAccount = {
  account_id: string;
  name?: string;
  official_name?: string | null;
  type?: string;
  subtype?: string | null;
  balances?: {
    available?: number | null;
    current?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  };
};

export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  date?: string;
  authorized_date?: string | null;
  datetime?: string | null;
  authorized_datetime?: string | null;
  name?: string;
  merchant_name?: string | null;
  amount: number;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  pending?: boolean;
  original_description?: string | null;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
    confidence_level?: string | null;
  } | null;
};

export type PlaidRemovedTransaction = {
  transaction_id: string;
};

export async function syncPlaidTransactions({
  accessToken,
  cursor,
  count = 100,
}: {
  accessToken: string;
  cursor?: string | null;
  count?: number;
}) {
  return plaidPost<{
    accounts: PlaidAccount[];
    added: PlaidTransaction[];
    modified: PlaidTransaction[];
    removed: PlaidRemovedTransaction[];
    next_cursor: string;
    has_more: boolean;
    request_id: string;
    transactions_update_status?: string;
  }>('/transactions/sync', {
    access_token: accessToken,
    cursor: cursor || undefined,
    count,
    options: {
      include_original_description: true,
      days_requested: 90,
    },
  });
}
