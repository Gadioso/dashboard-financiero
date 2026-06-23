import type { SupabaseClient } from '@supabase/supabase-js';
import { clasificarMovimientoFinanciero } from '@/lib/ai-classifier';
import { categoriaParaGastos } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';

type Supabase = SupabaseClient;

type BankTransactionRaw = {
  id: string;
  profile_id: string;
  posted_at: string | null;
  description: string;
  merchant_name: string | null;
  amount: number | string;
  currency: string | null;
  classification_attempts?: number | null;
};

export type BankClassificationResult = {
  transactionId: string;
  status: 'classified' | 'failed' | 'ignored';
  movementId?: string | number | null;
  movementType?: 'gasto' | 'ingreso';
  error?: string;
};

export type ProcessBankTransactionsResult = {
  processed: number;
  classified: number;
  failed: number;
  ignored: number;
  limit: number;
  remainingPending: number;
  results: BankClassificationResult[];
};

const defaultLimit = 10;
const maxLimit = 50;

function normalizeLimit(value?: number | null) {
  const envLimit = Number(process.env.BANK_CLASSIFICATION_BATCH_SIZE || defaultLimit);
  const requested = Number(value || envLimit);

  if (!Number.isFinite(requested) || requested <= 0) return defaultLimit;

  return Math.min(Math.floor(requested), maxLimit);
}

function movementTextFromBankTransaction(transaction: BankTransactionRaw) {
  const amount = Math.abs(Number(transaction.amount || 0));
  const concept = transaction.merchant_name || transaction.description || 'Movimiento bancario';
  const currency = transaction.currency || 'MXN';
  const verb = Number(transaction.amount) < 0 ? 'recibí' : 'pagué';

  return `${verb} ${amount} ${currency} en ${concept}`;
}

function postedDate(transaction: BankTransactionRaw) {
  if (!transaction.posted_at) return new Date();

  const date = new Date(`${transaction.posted_at}T12:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function countPending({
  supabase,
  profileId,
}: {
  supabase: Supabase;
  profileId: string;
}) {
  const { count } = await supabase
    .from('bank_transactions_raw')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('normalized_status', 'pending');

  return count || 0;
}

async function markFailed({
  supabase,
  transaction,
  error,
}: {
  supabase: Supabase;
  transaction: BankTransactionRaw;
  error: unknown;
}) {
  const message = error instanceof Error ? error.message : 'No pude clasificar el movimiento bancario.';

  await supabase
    .from('bank_transactions_raw')
    .update({
      normalized_status: 'failed',
      classification_attempts: Number(transaction.classification_attempts || 0) + 1,
      classification_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .eq('profile_id', transaction.profile_id);

  return message;
}

async function classifyOne({
  supabase,
  transaction,
  googleApiKey,
}: {
  supabase: Supabase;
  transaction: BankTransactionRaw;
  googleApiKey: string;
}): Promise<BankClassificationResult> {
  const amount = Number(transaction.amount || 0);

  if (!Number.isFinite(amount) || amount === 0) {
    await supabase
      .from('bank_transactions_raw')
      .update({
        normalized_status: 'ignored',
        classification_attempts: Number(transaction.classification_attempts || 0) + 1,
        classification_error: amount === 0 ? 'Movimiento bancario con monto cero.' : 'Monto bancario inválido.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)
      .eq('profile_id', transaction.profile_id);

    return { transactionId: transaction.id, status: 'ignored' };
  }

  try {
    const movement = await clasificarMovimientoFinanciero(movementTextFromBankTransaction(transaction), googleApiKey);
    const movementDate = postedDate(transaction).toISOString();

    if (movement.tipo === 'ingreso') {
      const { data, error } = await supabase
        .from('ingresos')
        .upsert([{
          profile_id: transaction.profile_id,
          concepto: movement.concepto,
          monto: Number(movement.monto),
          tipo: 'Banco',
          fecha: movementDate,
          bank_transaction_raw_id: transaction.id,
        }], { onConflict: 'bank_transaction_raw_id' })
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      const movementId = (data as { id?: string | number } | null)?.id || null;

      await supabase
        .from('bank_transactions_raw')
        .update({
          normalized_status: 'classified',
          ingreso_id: movementId,
          classification_attempts: Number(transaction.classification_attempts || 0) + 1,
          classification_error: null,
          classified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)
        .eq('profile_id', transaction.profile_id);

      await sincronizarPresupuestoMensual(supabase, postedDate(transaction), transaction.profile_id);

      return { transactionId: transaction.id, status: 'classified', movementId, movementType: 'ingreso' };
    }

    const { data, error } = await supabase
      .from('gastos')
      .upsert([{
        profile_id: transaction.profile_id,
        concepto: movement.concepto,
        monto: Number(movement.monto),
        categoria: categoriaParaGastos(movement.categoria),
        subcategoria: movement.subcategoria,
        origen: 'Banco',
        fecha: movementDate,
        bank_transaction_raw_id: transaction.id,
      }], { onConflict: 'bank_transaction_raw_id' })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    const movementId = (data as { id?: string | number } | null)?.id || null;

    await supabase
      .from('bank_transactions_raw')
      .update({
        normalized_status: 'classified',
        gasto_id: movementId,
        classification_attempts: Number(transaction.classification_attempts || 0) + 1,
        classification_error: null,
        classified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)
      .eq('profile_id', transaction.profile_id);

    return { transactionId: transaction.id, status: 'classified', movementId, movementType: 'gasto' };
  } catch (error: unknown) {
    const message = await markFailed({ supabase, transaction, error });

    return { transactionId: transaction.id, status: 'failed', error: message };
  }
}

export async function processPendingBankTransactions({
  supabase,
  profileId,
  limit,
  googleApiKey,
}: {
  supabase: Supabase;
  profileId: string;
  limit?: number | null;
  googleApiKey: string;
}): Promise<ProcessBankTransactionsResult> {
  const normalizedLimit = normalizeLimit(limit);
  const { data, error } = await supabase
    .from('bank_transactions_raw')
    .select('id, profile_id, posted_at, description, merchant_name, amount, currency, classification_attempts')
    .eq('profile_id', profileId)
    .eq('normalized_status', 'pending')
    .order('posted_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (error) throw new Error(`No pude leer transacciones pendientes: ${error.message}`);

  const transactions = (data || []) as BankTransactionRaw[];
  const results: BankClassificationResult[] = [];

  for (const transaction of transactions) {
    results.push(await classifyOne({ supabase, transaction, googleApiKey }));
  }

  const remainingPending = await countPending({ supabase, profileId });

  return {
    processed: results.length,
    classified: results.filter((result) => result.status === 'classified').length,
    failed: results.filter((result) => result.status === 'failed').length,
    ignored: results.filter((result) => result.status === 'ignored').length,
    limit: normalizedLimit,
    remainingPending,
    results,
  };
}
