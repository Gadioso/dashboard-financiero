import { defaultBankClassificationStartDate, processPendingBankTransactions } from '@/lib/bank-transaction-classifier';
import { deliverPendingMovementNotifications, queueBankMovementNotifications } from '@/lib/movement-notifications';
import { createSyncfySession, listSyncfyAccounts, listSyncfyTransactions, requestSyncfyCredentialPull, waitForSyncfyPull, type SyncfyAccount, type SyncfyTransaction } from '@/lib/open-banking/syncfy';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

type Supabase = NonNullable<ReturnType<typeof getSupabaseServiceClient>>;

type SyncfyUserRow = {
  syncfy_user_id: string;
};

type BankConnection = {
  id: string;
  profile_id: string;
  provider_item_id?: string | null;
  institution_name?: string | null;
  last_pull_requested_at?: string | null;
  next_pull_at?: string | null;
};

type BankAccountRow = {
  id: string;
  provider_account_id: string;
};

type AccountUpsertPayload = {
  profile_id: string;
  connection_id: string;
  provider_account_id: string;
  name: string;
  official_name: string | null;
  type: string | null;
  subtype: string | null;
  currency: string;
  current_balance: number | null;
  available_balance: number | null;
  raw: SyncfyAccount;
  updated_at: string;
};

type TransactionUpsertPayload = {
  profile_id: string;
  connection_id: string;
  account_id: string | null;
  provider_transaction_id: string;
  posted_at: string;
  authorized_at: string | null;
  description: string;
  merchant_name: string | null;
  amount: number;
  currency: string;
  raw: SyncfyTransaction;
  normalized_status: string;
  updated_at: string;
};

type ExistingRawTransaction = {
  provider_transaction_id: string;
  normalized_status: string;
};

const bankTrackingStartDate = '2026-07-10';

export type SyncfyConnectionSyncResult = {
  connectionId: string;
  institutionName?: string | null;
  accounts: number;
  transactions: number;
  insertedOrUpdated: number;
  errors: string[];
  warnings: string[];
  pullRequested: boolean;
  pullCompleted: boolean;
};

export type SyncfyProfileSyncResult = {
  provider: 'syncfy';
  results: SyncfyConnectionSyncResult[];
  totals: {
    accounts: number;
    transactions: number;
    insertedOrUpdated: number;
    failed: number;
  };
  classification: Awaited<ReturnType<typeof processPendingBankTransactions>> | null;
  notifications: Awaited<ReturnType<typeof deliverPendingMovementNotifications>>;
  classificationFrom: string;
};

function isAccountPayload(value: AccountUpsertPayload | null): value is AccountUpsertPayload {
  return Boolean(value);
}

function isTransactionPayload(value: TransactionUpsertPayload | null): value is TransactionUpsertPayload {
  return Boolean(value);
}

function valueAsString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);

  return null;
}

function valueAsNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function syncfyDateToIso(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function syncfyDateToDay(value: unknown) {
  return syncfyDateToIso(value)?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function accountProviderId(account: SyncfyAccount) {
  return valueAsString(account.id_account) || valueAsString(account.id) || valueAsString(account.number) || null;
}

function transactionProviderId(transaction: SyncfyTransaction) {
  return valueAsString(transaction.id_transaction)
    || valueAsString(transaction.id)
    || valueAsString(transaction.id_external)
    || null;
}

function transactionDescription(transaction: SyncfyTransaction) {
  return valueAsString(transaction.description)
    || valueAsString(transaction.concept)
    || valueAsString(transaction.reference)
    || 'Movimiento bancario';
}

function syncfyPullCooldownSeconds() {
  const configured = Number(process.env.BANK_SYNCFY_PULL_COOLDOWN_SECONDS || 180);
  return Number.isFinite(configured) ? Math.max(180, Math.min(Math.floor(configured), 3600)) : 180;
}

function syncfyRetrySeconds(message: string) {
  const match = message.match(/try again in\s+(?:(\d+)\s*m(?:in)?\s*)?(?:(\d+)\s*s)?/i);
  if (!match) return syncfyPullCooldownSeconds();
  return Math.max(60, Number(match[1] || 0) * 60 + Number(match[2] || 0) + 10);
}

export function getBankAutoClassifyFrom() {
  const candidate = process.env.BANK_AUTO_CLASSIFY_FROM || defaultBankClassificationStartDate;

  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : defaultBankClassificationStartDate;
}

export function getBankClassifierApiKey() {
  return process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

export async function getSyncfyUserIdForProfile(supabase: Supabase, profileId: string) {
  const { data, error } = await supabase
    .from('syncfy_users')
    .select('syncfy_user_id')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as SyncfyUserRow | null)?.syncfy_user_id || null;
}

async function upsertAccounts({
  supabase,
  connection,
  accounts,
}: {
  supabase: Supabase;
  connection: BankConnection;
  accounts: SyncfyAccount[];
}) {
  const payload = accounts
    .map((account) => {
      const providerAccountId = accountProviderId(account);

      if (!providerAccountId) return null;

      return {
        profile_id: connection.profile_id,
        connection_id: connection.id,
        provider_account_id: providerAccountId,
        name: valueAsString(account.name) || valueAsString(account.number) || connection.institution_name || 'Cuenta bancaria',
        official_name: valueAsString(account.name) || null,
        type: valueAsString(account.type),
        subtype: valueAsString(account.subtype),
        currency: valueAsString(account.currency) || 'MXN',
        current_balance: valueAsNumber(account.balance ?? account.current_balance ?? account.balance_current),
        available_balance: valueAsNumber(account.balance_available ?? account.available_balance),
        raw: account,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(isAccountPayload);

  if (!payload.length) return new Map<string, string>();

  const { data, error } = await supabase
    .from('bank_accounts')
    .upsert(payload, { onConflict: 'connection_id,provider_account_id' })
    .select('id, provider_account_id');

  if (error) throw new Error(`No pude guardar cuentas Syncfy: ${error.message}`);

  return new Map((data as BankAccountRow[] | null || []).map((account) => [account.provider_account_id, account.id]));
}

async function upsertTransactions({
  supabase,
  connection,
  transactions,
  accountIds,
}: {
  supabase: Supabase;
  connection: BankConnection;
  transactions: SyncfyTransaction[];
  accountIds: Map<string, string>;
}) {
  const providerTransactionIds = transactions
    .map((transaction) => transactionProviderId(transaction))
    .filter((value): value is string => Boolean(value));
  const existingStatus = new Map<string, string>();

  if (providerTransactionIds.length) {
    const { data, error } = await supabase
      .from('bank_transactions_raw')
      .select('provider_transaction_id, normalized_status')
      .eq('profile_id', connection.profile_id)
      .eq('connection_id', connection.id)
      .in('provider_transaction_id', providerTransactionIds);

    if (error) throw new Error(`No pude leer movimientos Syncfy existentes: ${error.message}`);

    ((data || []) as ExistingRawTransaction[]).forEach((transaction) => {
      existingStatus.set(transaction.provider_transaction_id, transaction.normalized_status);
    });
  }

  const payload = transactions
    .map((transaction) => {
      const providerTransactionId = transactionProviderId(transaction);
      const providerAccountId = valueAsString(transaction.id_account);

      if (!providerTransactionId) return null;

      const postedAt = syncfyDateToDay(transaction.dt_transaction ?? transaction.dt_accounting ?? transaction.date);
      if (postedAt < bankTrackingStartDate) return null;

      return {
        profile_id: connection.profile_id,
        connection_id: connection.id,
        account_id: providerAccountId ? accountIds.get(providerAccountId) || null : null,
        provider_transaction_id: providerTransactionId,
        posted_at: postedAt,
        authorized_at: syncfyDateToIso(transaction.dt_transaction ?? transaction.dt_accounting ?? transaction.date),
        description: transactionDescription(transaction),
        merchant_name: valueAsString(transaction.merchant_name ?? transaction.merchant),
        amount: valueAsNumber(transaction.amount ?? transaction.total ?? transaction.value) || 0,
        currency: valueAsString(transaction.currency) || 'MXN',
        raw: transaction,
        normalized_status: existingStatus.get(providerTransactionId) || 'pending',
        updated_at: new Date().toISOString(),
      };
    })
    .filter(isTransactionPayload);

  if (!payload.length) return { insertedOrUpdated: 0, newTransactions: [] as Array<TransactionUpsertPayload & { rawTransactionId: string }> };

  const newProviderTransactionIds = new Set(
    payload
      .filter((transaction) => !existingStatus.has(transaction.provider_transaction_id))
      .map((transaction) => transaction.provider_transaction_id)
  );

  const { data, error } = await supabase
    .from('bank_transactions_raw')
    .upsert(payload, { onConflict: 'connection_id,provider_transaction_id' })
    .select('id, provider_transaction_id');

  if (error) throw new Error(`No pude guardar movimientos Syncfy: ${error.message}`);

  const rawIds = new Map(
    ((data || []) as Array<{ id: string; provider_transaction_id: string }>)
      .map((transaction) => [transaction.provider_transaction_id, transaction.id])
  );
  const newTransactions = payload
    .filter((transaction) => newProviderTransactionIds.has(transaction.provider_transaction_id))
    .map((transaction) => ({ ...transaction, rawTransactionId: rawIds.get(transaction.provider_transaction_id) || '' }))
    .filter((transaction) => Boolean(transaction.rawTransactionId));

  return { insertedOrUpdated: data?.length || 0, newTransactions };
}

export async function syncSyncfyProfile({
  supabase,
  profileId,
  syncfyUserId,
  classify = true,
  pullBeforeRead = false,
}: {
  supabase: Supabase;
  profileId: string;
  syncfyUserId?: string | null;
  classify?: boolean;
  pullBeforeRead?: boolean;
}): Promise<SyncfyProfileSyncResult> {
  const resolvedSyncfyUserId = syncfyUserId || await getSyncfyUserIdForProfile(supabase, profileId);

  if (!resolvedSyncfyUserId) {
    throw new Error('Primero conecta Syncfy.');
  }

  const { data, error } = await supabase
    .from('bank_connections')
    .select('id, profile_id, provider_item_id, institution_name, last_pull_requested_at, next_pull_at')
    .eq('profile_id', profileId)
    .eq('provider', 'syncfy')
    .eq('status', 'active');

  if (error) throw new Error(error.message);

  const connections = (data || []) as BankConnection[];

  if (!connections.length) {
    throw new Error('Primero agrega un banco Syncfy.');
  }

  const session = await createSyncfySession(resolvedSyncfyUserId);
  const results: SyncfyConnectionSyncResult[] = [];

  for (const connection of connections) {
    const activeRun = await supabase
      .from('bank_sync_runs')
      .select('id, started_at')
      .eq('profile_id', profileId)
      .eq('connection_id', connection.id)
      .eq('provider', 'syncfy')
      .eq('status', 'running')
      .gte('started_at', new Date(Date.now() - 90_000).toISOString())
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeRun.data?.id) {
      results.push({
        connectionId: connection.id,
        institutionName: connection.institution_name,
        accounts: 0,
        transactions: 0,
        insertedOrUpdated: 0,
        errors: [],
        warnings: ['Ya existe una sincronización Syncfy en curso; este ciclo continuará con la cola pendiente.'],
        pullRequested: false,
        pullCompleted: false,
      });
      continue;
    }

    const run = await supabase
      .from('bank_sync_runs')
      .insert({
        profile_id: profileId,
        connection_id: connection.id,
        provider: 'syncfy',
        status: 'running',
      })
      .select('id')
      .single();
    const runId = (run.data as { id?: string } | null)?.id || null;

    try {
      const idCredential = connection.provider_item_id || null;
      let pullRequested = false;
      let pullCompleted = false;
      const warnings: string[] = [];

      if (pullBeforeRead && idCredential) {
        const now = new Date();
        const nextPullAt = connection.next_pull_at ? new Date(connection.next_pull_at) : null;
        if (!nextPullAt || Number.isNaN(nextPullAt.getTime()) || nextPullAt <= now) {
          const cooldownUntil = new Date(now.getTime() + syncfyPullCooldownSeconds() * 1000).toISOString();
          const claim = await supabase
            .from('bank_connections')
            .update({ last_pull_requested_at: now.toISOString(), next_pull_at: cooldownUntil, updated_at: now.toISOString() })
            .eq('id', connection.id)
            .eq('profile_id', profileId)
            .or(`next_pull_at.is.null,next_pull_at.lte.${now.toISOString()}`)
            .select('id')
            .maybeSingle();

          if (claim.data?.id) {
            try {
              const pull = await requestSyncfyCredentialPull(session.token, idCredential);
              pullRequested = true;
              const pullResult = await waitForSyncfyPull(session.token, pull.id_job);
              pullCompleted = pullResult.completed;
              if (!pullCompleted) warnings.push('Syncfy sigue actualizando Santander; se leyó la última información y el webhook completará la descarga.');
            } catch (pullError) {
              const message = pullError instanceof Error ? pullError.message : 'No pude solicitar una actualización inmediata.';
              const retryAt = new Date(Date.now() + syncfyRetrySeconds(message) * 1000).toISOString();
              await supabase
                .from('bank_connections')
                .update({ next_pull_at: retryAt, error_message: message, updated_at: new Date().toISOString() })
                .eq('id', connection.id)
                .eq('profile_id', profileId);
              warnings.push(`${message} Se reintentará automáticamente.`);
            }
          }
        }
      }
      const accounts = await listSyncfyAccounts(session.token, { idCredential });
      const transactions = await listSyncfyTransactions(session.token, { idCredential });
      const accountIds = await upsertAccounts({ supabase, connection, accounts });
      const transactionResult = await upsertTransactions({ supabase, connection, transactions, accountIds });
      const insertedOrUpdated = transactionResult.insertedOrUpdated;
      await queueBankMovementNotifications(supabase, profileId, transactionResult.newTransactions.map((transaction) => ({
        rawTransactionId: transaction.rawTransactionId,
        description: transaction.description,
        amount: transaction.amount,
        currency: transaction.currency,
        postedAt: transaction.posted_at,
        institution: connection.institution_name,
        normalizedStatus: transaction.normalized_status,
      })));

      await supabase
        .from('bank_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
        .eq('profile_id', profileId);

      if (runId) {
        await supabase
          .from('bank_sync_runs')
          .update({
            status: 'success',
            finished_at: new Date().toISOString(),
            inserted_count: insertedOrUpdated,
            updated_count: 0,
            ignored_count: 0,
          })
          .eq('id', runId)
          .eq('profile_id', profileId);
      }

      results.push({
        connectionId: connection.id,
        institutionName: connection.institution_name,
        accounts: accounts.length,
        transactions: transactions.length,
        insertedOrUpdated,
        errors: [],
        warnings,
        pullRequested,
        pullCompleted,
      });
    } catch (syncError: unknown) {
      const message = syncError instanceof Error ? syncError.message : 'Error sincronizando Syncfy.';

      await supabase
        .from('bank_connections')
        .update({
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
        .eq('profile_id', profileId);

      if (runId) {
        await supabase
          .from('bank_sync_runs')
          .update({
            status: 'error',
            finished_at: new Date().toISOString(),
            error_message: message,
          })
          .eq('id', runId)
          .eq('profile_id', profileId);
      }

      results.push({
        connectionId: connection.id,
        institutionName: connection.institution_name,
        accounts: 0,
        transactions: 0,
        insertedOrUpdated: 0,
        errors: [message],
        warnings: [],
        pullRequested: false,
        pullCompleted: false,
      });
    }
  }

  const totals = results.reduce(
    (acc, result) => ({
      accounts: acc.accounts + result.accounts,
      transactions: acc.transactions + result.transactions,
      insertedOrUpdated: acc.insertedOrUpdated + result.insertedOrUpdated,
      failed: acc.failed + (result.errors.length ? 1 : 0),
    }),
    { accounts: 0, transactions: 0, insertedOrUpdated: 0, failed: 0 }
  );
  const classificationFrom = getBankAutoClassifyFrom();
  const googleApiKey = getBankClassifierApiKey();
  const classification = classify
    ? await processPendingBankTransactions({
      supabase,
      profileId,
      limit: Number(process.env.BANK_CLASSIFICATION_BATCH_SIZE || 100),
      googleApiKey,
      minPostedAt: classificationFrom,
      deterministicOnly: !googleApiKey,
    })
    : null;
  const notifications = await deliverPendingMovementNotifications(supabase, { profileId, limit: 100 });

  return {
    provider: 'syncfy',
    results,
    totals,
    classification,
    notifications,
    classificationFrom,
  };
}
