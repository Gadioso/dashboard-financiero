import { NextResponse } from 'next/server';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type GmailIntegration = {
  id: string;
  profile_id: string;
  email: string;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string | null;
  history_id?: string | null;
  status?: string | null;
};

type GmailListResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: { message?: string };
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPayload;
  error?: { message?: string };
};

type GmailPayload = {
  mimeType?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type SyncResult = {
  integrationId: string;
  email: string;
  profileId: string;
  processed: number;
  inserted: number;
  duplicate: number;
  ignored: number;
  failed: number;
  skippedMessages: number;
  skipped?: string;
  errors: string[];
};

const gmailSearchQuery = process.env.GMAIL_BANK_SEARCH_QUERY || 'from:santander newer_than:14d';
const maxMessagesPerSync = Number(process.env.GMAIL_SYNC_MAX_MESSAGES || 20);

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.toLowerCase().startsWith('bearer ')) return '';

  return authorization.slice(7).trim();
}

function isCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';
  const userAgent = request.headers.get('user-agent') || '';

  if (userAgent.includes('vercel-cron/1.0')) return true;
  if (!cronSecret) return false;

  return getBearerToken(request) === cronSecret;
}

function shouldRefreshToken(expiresAt?: string | null) {
  if (!expiresAt) return true;

  const expiresAtMs = new Date(expiresAt).getTime();

  if (Number.isNaN(expiresAtMs)) return true;

  return expiresAtMs - Date.now() < 2 * 60 * 1000;
}

function requireGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    throw new Error('Faltan GOOGLE_GMAIL_CLIENT_ID o GOOGLE_GMAIL_CLIENT_SECRET.');
  }

  return { clientId, clientSecret };
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = requireGoogleOAuthConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await response.json()) as TokenResponse;

  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'No pude refrescar el token de Gmail.');
  }

  return data;
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function collectMessageBodies(payload?: GmailPayload): string[] {
  if (!payload) return [];

  const current = payload.body?.data ? decodeBase64Url(payload.body.data) : '';
  const body = current && payload.mimeType === 'text/html' ? stripHtml(current) : current;
  const children = (payload.parts || []).flatMap((part) => collectMessageBodies(part));

  return [body, ...children].filter((part) => part.trim());
}

function getHeader(message: GmailMessage, name: string) {
  const header = message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());

  return header?.value || '';
}

function getGmailReceivedAt(message: GmailMessage) {
  if (message.internalDate && /^\d+$/.test(message.internalDate)) {
    return new Date(Number(message.internalDate)).toISOString();
  }

  const dateHeader = getHeader(message, 'Date');
  const parsed = dateHeader ? new Date(dateHeader) : null;

  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

async function gmailFetch<T>(path: string, accessToken: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(data.error?.message || `Gmail API respondió ${response.status}.`);
  }

  return data;
}

async function listCandidateMessages(accessToken: string) {
  const params = new URLSearchParams({
    q: gmailSearchQuery,
    maxResults: String(Math.max(1, Math.min(maxMessagesPerSync || 20, 50))),
  });
  const data = await gmailFetch<GmailListResponse>(`messages?${params.toString()}`, accessToken);

  return data.messages?.filter((message) => message.id).map((message) => message.id as string) || [];
}

async function fetchMessage(accessToken: string, messageId: string) {
  const params = new URLSearchParams({ format: 'full' });

  return gmailFetch<GmailMessage>(`messages/${encodeURIComponent(messageId)}?${params.toString()}`, accessToken);
}

async function postToSantanderIngest(request: Request, integration: GmailIntegration, message: GmailMessage) {
  const emailIngestSecret = process.env.EMAIL_INGEST_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';

  if (!emailIngestSecret) {
    throw new Error('Falta configurar EMAIL_INGEST_SECRET para procesar correos bancarios.');
  }

  const rawBody = collectMessageBodies(message.payload).join('\n\n') || message.snippet || '';
  const response = await fetch(new URL('/api/email/santander', request.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-email-ingest-secret': emailIngestSecret,
    },
    body: JSON.stringify({
      ingestEmail: integration.email,
      gmailAccount: integration.email,
      gmailMessageId: message.id,
      from: getHeader(message, 'From'),
      subject: getHeader(message, 'Subject'),
      raw: rawBody,
      snippet: message.snippet,
      gmailReceivedAt: getGmailReceivedAt(message),
    }),
  });
  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Ingesta bancaria respondió ${response.status}.`);
  }

  return data as { ignored?: boolean; duplicate?: boolean; data?: unknown };
}

async function hasProcessedGmailMessage({
  profileId,
  messageId,
}: {
  profileId: string;
  messageId: string;
}) {
  const supabase = getSupabaseServiceClient();

  if (!supabase) return false;

  const { data, error } = await supabase
    .from('santander_ingest_logs')
    .select('id')
    .eq('profile_id', profileId)
    .eq('gmail_message_id', messageId)
    .limit(1)
    .maybeSingle();

  if (error) return false;

  return Boolean(data);
}

async function syncIntegration(request: Request, integration: GmailIntegration): Promise<SyncResult> {
  const supabase = getSupabaseServiceClient();
  const result: SyncResult = {
    integrationId: integration.id,
    email: integration.email,
    profileId: integration.profile_id,
    processed: 0,
    inserted: 0,
    duplicate: 0,
    ignored: 0,
    failed: 0,
    skippedMessages: 0,
    errors: [],
  };

  if (!supabase) {
    throw new Error('Falta configurar llave de Supabase.');
  }

  if (!integration.access_token_encrypted || !integration.refresh_token_encrypted) {
    return { ...result, skipped: 'missing_oauth_tokens' };
  }

  try {
    let accessToken = decryptSecret(integration.access_token_encrypted);
    const refreshToken = decryptSecret(integration.refresh_token_encrypted);

    if (!refreshToken) return { ...result, skipped: 'missing_refresh_token' };

    if (!accessToken || shouldRefreshToken(integration.token_expires_at)) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token || null;
      const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null;

      await supabase
        .from('gmail_integrations')
        .update({
          access_token_encrypted: accessToken ? encryptSecret(accessToken) : integration.access_token_encrypted,
          refresh_token_encrypted: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : integration.refresh_token_encrypted,
          token_expires_at: expiresAt,
          scope: refreshed.scope || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
        .eq('profile_id', integration.profile_id);
    }

    if (!accessToken) return { ...result, skipped: 'missing_access_token' };

    const messageIds = await listCandidateMessages(accessToken);
    let latestHistoryId = integration.history_id || null;

    for (const messageId of messageIds) {
      try {
        const alreadyProcessed = await hasProcessedGmailMessage({
          profileId: integration.profile_id,
          messageId,
        });

        if (alreadyProcessed) {
          result.skippedMessages += 1;
          continue;
        }

        const message = await fetchMessage(accessToken, messageId);
        const ingestResult = await postToSantanderIngest(request, integration, message);

        result.processed += 1;
        if (ingestResult.ignored) result.ignored += 1;
        else if (ingestResult.duplicate) result.duplicate += 1;
        else result.inserted += 1;
        if (message.historyId) latestHistoryId = message.historyId;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido procesando correo.';

        result.failed += 1;
        result.errors.push(`${messageId}: ${message}`);
      }
    }

    await supabase
      .from('gmail_integrations')
      .update({
        history_id: latestHistoryId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
      .eq('profile_id', integration.profile_id);

    return result;
  } catch (error: unknown) {
    return {
      ...result,
      failed: result.failed + 1,
      errors: [error instanceof Error ? error.message : 'Error desconocido sincronizando Gmail.'],
    };
  }
}

async function runSync(request: Request, mode: 'cron' | 'user') {
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
  }

  let profileId: string | null = null;

  if (mode === 'user') {
    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    profileId = tenant.profileId;
  }

  let query = supabase
    .from('gmail_integrations')
    .select('id, profile_id, email, access_token_encrypted, refresh_token_encrypted, token_expires_at, history_id, status')
    .eq('status', 'active')
    .not('profile_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(mode === 'cron' ? 50 : 5);

  if (profileId) query = query.eq('profile_id', profileId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const integrations = (data || []) as GmailIntegration[];
  const results = [];

  for (const integration of integrations) {
    results.push(await syncIntegration(request, integration));
  }

  return NextResponse.json({
    success: true,
    mode,
    query: gmailSearchQuery,
    integrationCount: integrations.length,
    results,
    totals: results.reduce(
      (acc, item) => ({
        processed: acc.processed + item.processed,
        inserted: acc.inserted + item.inserted,
        duplicate: acc.duplicate + item.duplicate,
        ignored: acc.ignored + item.ignored,
        failed: acc.failed + item.failed,
        skippedMessages: acc.skippedMessages + item.skippedMessages,
        skipped: acc.skipped + (item.skipped ? 1 : 0),
      }),
      { processed: 0, inserted: 0, duplicate: 0, ignored: 0, failed: 0, skippedMessages: 0, skipped: 0 }
    ),
  });
}

export async function GET(request: Request) {
  if (isCronRequest(request)) {
    return runSync(request, 'cron');
  }

  return runSync(request, 'user');
}

export async function POST(request: Request) {
  return runSync(request, 'user');
}
