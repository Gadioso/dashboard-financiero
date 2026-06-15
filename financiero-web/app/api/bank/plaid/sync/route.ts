import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { decryptBankSecret } from '@/lib/open-banking/bank-secret-box';
import { PlaidTransaction, syncPlaidTransactions } from '@/lib/open-banking/plaid';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type BankConnection = {
  id: string;
  profile_id: string;
  provider: string;
  institution_name?: string | null;
  access_token_encrypted?: string | null;
  transactions_cursor?: string | null;
};

type BankAccountRow = {
  id: string;
  provider_account_id: string;
};

type SyncConnectionResult = {
  connectionId: string;
  institutionName?: string | null;
  accounts: number;
  added: number;
  modified: number;
  removed: number;
  insertedOrUpdated: number;
  errors: string[];
};

function currencyFromAccount(account: { balances?: { iso_currency_code?: string | null; unofficial_currency_code?: string | null } }) {
  return account.balances?.iso_currency_code || account.balances?.unofficial_currency_code || 'MXN';
}

function currencyFromTransaction(transaction: PlaidTransaction) {
  return transaction.iso_currency_code || transaction.unofficial_currency_code || 'MXN';
}

function postedAtFromTransaction(transaction: PlaidTransaction) {
  if (transaction.date) return transaction.date;
  if (transaction.datetime) return transaction.datetime.slice(0, 10);

  return new Date().toISOString().slice(0, 10);
}

function authorizedAtFromTransaction(transaction: PlaidTransaction) {
  const value = transaction.authorized_datetime || transaction.authorized_date || transaction.datetime || transaction.date;

  if (!value) return null;

  const date = value.length === 10 ? new Date(`${value}T12:00:00.000Z`) : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function upsertAccounts({
  supabase,
  connection,
  accounts,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  connection: BankConnection;
  accounts: Awaited<ReturnType<typeof syncPlaidTransactions>>['accounts'];
}) {
  if (!accounts.length) return new Map<string, string>();

  const payload = accounts.map((account) => ({
    profile_id: connection.profile_id,
    connection_id: connection.id,
    provider_account_id: account.account_id,
    name: account.name || null,
    official_name: account.official_name || null,
    type: account.type || null,
    subtype: account.subtype || null,
    currency: currencyFromAccount(account),
    current_balance: account.balances?.current ?? null,
    available_balance: account.balances?.available ?? null,
    raw: account,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('bank_accounts')
    .upsert(payload, { onConflict: 'connection_id,provider_account_id' })
    .select('id, provider_account_id');

  if (error) throw new Error(`No pude guardar cuentas bancarias: ${error.message}`);

  return new Map((data as BankAccountRow[] | null || []).map((account) => [account.provider_account_id, account.id]));
}

async function upsertTransactions({
  supabase,
  connection,
  transactions,
  accountIds,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  connection: BankConnection;
  transactions: PlaidTransaction[];
  accountIds: Map<string, string>;
}) {
  if (!transactions.length) return 0;

  const payload = transactions.map((transaction) => ({
    profile_id: connection.profile_id,
    connection_id: connection.id,
    account_id: accountIds.get(transaction.account_id) || null,
    provider_transaction_id: transaction.transaction_id,
    posted_at: postedAtFromTransaction(transaction),
    authorized_at: authorizedAtFromTransaction(transaction),
    description: transaction.name || transaction.original_description || 'Movimiento bancario',
    merchant_name: transaction.merchant_name || null,
    amount: transaction.amount,
    currency: currencyFromTransaction(transaction),
    raw: transaction,
    normalized_status: transaction.pending ? 'ignored' : 'pending',
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('bank_transactions_raw')
    .upsert(payload, { onConflict: 'connection_id,provider_transaction_id' })
    .select('id');

  if (error) throw new Error(`No pude guardar movimientos bancarios: ${error.message}`);

  return data?.length || 0;
}

async function syncConnection(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  connection: BankConnection
): Promise<SyncConnectionResult> {
  const result: SyncConnectionResult = {
    connectionId: connection.id,
    institutionName: connection.institution_name,
    accounts: 0,
    added: 0,
    modified: 0,
    removed: 0,
    insertedOrUpdated: 0,
    errors: [],
  };

  const run = await supabase
    .from('bank_sync_runs')
    .insert({
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: 'plaid',
      status: 'running',
    })
    .select('id')
    .single();

  const runId = (run.data as { id?: string } | null)?.id || null;

  try {
    const accessToken = decryptBankSecret(connection.access_token_encrypted);

    if (!accessToken) throw new Error('La conexion bancaria no tiene token de acceso.');

    let cursor = connection.transactions_cursor || null;
    let hasMore = true;
    let pages = 0;
    let latestStatus: string | null = null;

    while (hasMore && pages < 5) {
      const plaid = await syncPlaidTransactions({
        accessToken,
        cursor,
      });
      const accountIds = await upsertAccounts({
        supabase,
        connection,
        accounts: plaid.accounts || [],
      });
      const changedTransactions = [...(plaid.added || []), ...(plaid.modified || [])];
      const upserted = await upsertTransactions({
        supabase,
        connection,
        transactions: changedTransactions,
        accountIds,
      });

      result.accounts += plaid.accounts?.length || 0;
      result.added += plaid.added?.length || 0;
      result.modified += plaid.modified?.length || 0;
      result.removed += plaid.removed?.length || 0;
      result.insertedOrUpdated += upserted;

      cursor = plaid.next_cursor || cursor;
      hasMore = Boolean(plaid.has_more);
      latestStatus = plaid.transactions_update_status || latestStatus;
      pages += 1;
    }

    await supabase
      .from('bank_connections')
      .update({
        transactions_cursor: cursor,
        transactions_update_status: latestStatus,
        last_sync_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('profile_id', connection.profile_id);

    if (runId) {
      await supabase
        .from('bank_sync_runs')
        .update({
          status: 'success',
          finished_at: new Date().toISOString(),
          inserted_count: result.added,
          updated_count: result.modified,
          ignored_count: result.removed,
        })
        .eq('id', runId)
        .eq('profile_id', connection.profile_id);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido sincronizando banco.';
    result.errors.push(message);

    await supabase
      .from('bank_connections')
      .update({
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('profile_id', connection.profile_id);

    if (runId) {
      await supabase
        .from('bank_sync_runs')
        .update({
          status: 'error',
          finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('id', runId)
        .eq('profile_id', connection.profile_id);
    }
  }

  return result;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bank_connections')
      .select('id, profile_id, provider, institution_name, access_token_encrypted, transactions_cursor')
      .eq('profile_id', tenant.profileId)
      .eq('provider', 'plaid')
      .eq('status', 'active');

    if (error) throw new Error(error.message);

    const connections = (data || []) as BankConnection[];

    if (!connections.length) {
      return NextResponse.json({
        success: false,
        error: 'Primero conecta un banco.',
      }, { status: 400 });
    }

    const results = [];

    for (const connection of connections) {
      results.push(await syncConnection(supabase, connection));
    }

    const failed = results.filter((result) => result.errors.length).length;
    const totals = results.reduce(
      (acc, result) => ({
        accounts: acc.accounts + result.accounts,
        added: acc.added + result.added,
        modified: acc.modified + result.modified,
        removed: acc.removed + result.removed,
        insertedOrUpdated: acc.insertedOrUpdated + result.insertedOrUpdated,
      }),
      { accounts: 0, added: 0, modified: 0, removed: 0, insertedOrUpdated: 0 }
    );

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank.sync',
      resourceType: 'bank_connections',
      metadata: {
        connections: connections.length,
        failed,
        totals,
      },
    });

    return NextResponse.json({
      success: failed === 0,
      results,
      totals,
    }, { status: failed ? 207 : 200 });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'bank.sync',
      error,
    });
    const message = error instanceof Error ? error.message : 'No pude sincronizar el banco.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
