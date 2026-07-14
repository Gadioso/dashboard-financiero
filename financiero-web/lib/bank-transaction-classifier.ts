import type { SupabaseClient } from '@supabase/supabase-js';
import { clasificarMovimientoFinanciero } from '@/lib/ai-classifier';
import { categoriaParaGastos } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { notifyDetectedMovement } from '@/lib/movement-notifications';

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
  bank_account?: {
    name?: string | null;
    official_name?: string | null;
    type?: string | null;
    subtype?: string | null;
  } | null;
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
const maxLimit = 200;
export const defaultBankClassificationStartDate = '2026-07-10';

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
  const verb = Number(transaction.amount) < 0 ? 'pagué' : 'recibí';

  return `${verb} ${amount} ${currency} en ${concept}`;
}

function cleanBankMovementConcept(concept: string, transaction: BankTransactionRaw) {
  const cleaned = concept
    .replace(/(^|\s)(pagu[eé]|recib[ií])(?=\s|$)/gi, ' ')
    .replace(/\b(mxn|m\.?n\.?|pesos?)\b/gi, ' ')
    .replace(/\$?\d+(?:[,.]\d{1,2})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || transaction.merchant_name || transaction.description || 'Movimiento bancario';
}

function normalizeMinPostedAt(value?: string | null) {
  const candidate = value || process.env.BANK_AUTO_CLASSIFY_FROM || defaultBankClassificationStartDate;

  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : defaultBankClassificationStartDate;
}

function postedDate(transaction: BankTransactionRaw) {
  if (!transaction.posted_at) return new Date();

  const date = new Date(`${transaction.posted_at}T12:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeAccountText(value: unknown) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isCuentaFreeToLikeUCardPayment(transaction: BankTransactionRaw) {
  if (Number(transaction.amount || 0) >= 0) return false;

  const source = normalizeAccountText(`${transaction.bank_account?.name || ''} ${transaction.bank_account?.official_name || ''}`);
  const movement = normalizeAccountText(`${transaction.description || ''} ${transaction.merchant_name || ''}`);
  const sourceIsCuentaFree = /\bcuenta\s*free\b/.test(source);
  const targetIsLikeU = /\b(?:like\s*u|like\s*you|likeu)\b/.test(movement);
  const identifiesCardPayment = /\b(?:cargo\s+pago\s+tarjeta\s+credito|abono\s+(?:a\s+)?tarjeta|pago\s+(?:a\s+)?(?:tarjeta|tdc)|pagar\s+(?:tarjeta|tdc))\b/.test(movement);

  return sourceIsCuentaFree && (targetIsLikeU || identifiesCardPayment);
}

function isCreditCardPaymentCounterpart(transaction: BankTransactionRaw) {
  if (Number(transaction.amount || 0) <= 0) return false;

  const account = normalizeAccountText(`${transaction.bank_account?.name || ''} ${transaction.bank_account?.official_name || ''} ${transaction.bank_account?.type || ''} ${transaction.bank_account?.subtype || ''}`);
  const movement = normalizeAccountText(`${transaction.description || ''} ${transaction.merchant_name || ''}`);
  const isCreditCard = /\b(?:like\s*u|likeu|credit\s*card|tarjeta\s*de\s*credito)\b/.test(account);
  const isPaymentCredit = /\bpago\s+por\s+transferencia\b/.test(movement);

  return isCreditCard && isPaymentCredit;
}

async function registerBankCardPayment(supabase: Supabase, transaction: BankTransactionRaw): Promise<BankClassificationResult> {
  const amount = Math.abs(Number(transaction.amount));
  const date = postedDate(transaction).toISOString();
  const rawTransactionId = transaction.id;
  const { data: existing, error: existingError } = await supabase
    .from('abonos_tarjeta_credito')
    .select('id')
    .eq('profile_id', transaction.profile_id)
    .contains('raw_payload', { bank_transaction_raw_id: rawTransactionId })
    .maybeSingle();

  if (existingError) throw new Error(`No pude revisar el abono existente: ${existingError.message}`);

  let movementId = existing?.id || null;
  if (!movementId) {
    const { data, error } = await supabase.from('abonos_tarjeta_credito').insert({
      profile_id: transaction.profile_id,
      concepto: 'Abono de Cuenta Free a Santander LikeU',
      monto: amount,
      tarjeta: 'Santander LikeU',
      origen: 'Banco',
      fecha: date,
      raw_payload: {
        bank_transaction_raw_id: rawTransactionId,
        source_account: transaction.bank_account?.name || transaction.bank_account?.official_name || 'Cuenta Free',
        description: transaction.description,
      },
    }).select('id').single();

    if (error) throw new Error(`No pude guardar el abono a Santander LikeU: ${error.message}`);
    movementId = data.id;
  }

  const { error: rawError } = await supabase.from('bank_transactions_raw').update({
    normalized_status: 'classified',
    classification_attempts: Number(transaction.classification_attempts || 0) + 1,
    classification_error: null,
    classified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', transaction.id).eq('profile_id', transaction.profile_id);

  if (rawError) throw new Error(`Guardé el abono, pero no pude cerrar la transacción bancaria: ${rawError.message}`);

  await notifyDetectedMovement(supabase, {
    profileId: transaction.profile_id,
    type: 'abono',
    concept: 'Abono de Cuenta Free a Santander LikeU',
    amount,
    category: 'Abono a tarjeta · no cuenta como gasto',
    source: 'Banco',
    resourceId: movementId,
    eventKey: `bank:${transaction.id}`,
  }).catch((error) => console.error('No pude notificar el abono detectado:', error));

  return { transactionId: transaction.id, status: 'classified', movementId };
}

async function countPending({
  supabase,
  profileId,
  minPostedAt,
}: {
  supabase: Supabase;
  profileId: string;
  minPostedAt?: string | null;
}) {
  const { count } = await supabase
    .from('bank_transactions_raw')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('normalized_status', 'pending')
    .gte('posted_at', normalizeMinPostedAt(minPostedAt));

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

  if (isCreditCardPaymentCounterpart(transaction)) {
    await supabase
      .from('bank_transactions_raw')
      .update({
        normalized_status: 'ignored',
        classification_attempts: Number(transaction.classification_attempts || 0) + 1,
        classification_error: 'Contrapartida del abono a tarjeta; no cuenta como ingreso.',
        classified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)
      .eq('profile_id', transaction.profile_id);

    return { transactionId: transaction.id, status: 'ignored' };
  }

  if (isCuentaFreeToLikeUCardPayment(transaction)) {
    try {
      return await registerBankCardPayment(supabase, transaction);
    } catch (error) {
      const message = await markFailed({ supabase, transaction, error });
      return { transactionId: transaction.id, status: 'failed', error: message };
    }
  }

  try {
    const movement = await clasificarMovimientoFinanciero(movementTextFromBankTransaction(transaction), googleApiKey, {
      supabase,
      profileId: transaction.profile_id,
    });
    const movementDate = postedDate(transaction).toISOString();
    const movementConcept = cleanBankMovementConcept(movement.concepto, transaction);

    if (movement.tipo === 'ingreso') {
      const payload = {
        profile_id: transaction.profile_id,
        concepto: movementConcept,
        monto: Number(movement.monto),
        tipo: 'Banco',
        fecha: movementDate,
        bank_transaction_raw_id: transaction.id,
      };
      const { data: existing } = await supabase
        .from('ingresos')
        .select('id')
        .eq('profile_id', transaction.profile_id)
        .eq('bank_transaction_raw_id', transaction.id)
        .maybeSingle();
      const { data, error } = existing?.id
        ? await supabase
          .from('ingresos')
          .update(payload)
          .eq('id', existing.id)
          .eq('profile_id', transaction.profile_id)
          .select('id')
          .single()
        : await supabase
          .from('ingresos')
          .insert([payload])
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

      await notifyDetectedMovement(supabase, {
        profileId: transaction.profile_id,
        type: 'ingreso',
        concept: movementConcept,
        amount: Number(movement.monto),
        source: 'Banco',
        resourceId: movementId,
        eventKey: `bank:${transaction.id}`,
      }).catch((error) => console.error('No pude notificar el ingreso detectado:', error));

      return { transactionId: transaction.id, status: 'classified', movementId, movementType: 'ingreso' };
    }

    const payload = {
      profile_id: transaction.profile_id,
      concepto: movementConcept,
      monto: Number(movement.monto),
      categoria: categoriaParaGastos(movement.categoria),
      subcategoria: movement.subcategoria,
      origen: 'Banco',
      fecha: movementDate,
      bank_transaction_raw_id: transaction.id,
    };
    const { data: existing } = await supabase
      .from('gastos')
      .select('id')
      .eq('profile_id', transaction.profile_id)
      .eq('bank_transaction_raw_id', transaction.id)
      .maybeSingle();
    const { data, error } = existing?.id
      ? await supabase
        .from('gastos')
        .update(payload)
        .eq('id', existing.id)
        .eq('profile_id', transaction.profile_id)
        .select('id')
        .single()
      : await supabase
        .from('gastos')
        .insert([payload])
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

    await notifyDetectedMovement(supabase, {
      profileId: transaction.profile_id,
      type: 'gasto',
      concept: movementConcept,
      amount: Number(movement.monto),
      category: `${movement.categoria}/${movement.subcategoria}`,
      source: 'Banco',
      resourceId: movementId,
      eventKey: `bank:${transaction.id}`,
    }).catch((error) => console.error('No pude notificar el gasto detectado:', error));

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
  minPostedAt,
  deterministicOnly = false,
}: {
  supabase: Supabase;
  profileId: string;
  limit?: number | null;
  googleApiKey: string;
  minPostedAt?: string | null;
  deterministicOnly?: boolean;
}): Promise<ProcessBankTransactionsResult> {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedMinPostedAt = normalizeMinPostedAt(minPostedAt);
  const { data, error } = await supabase
    .from('bank_transactions_raw')
    .select('id, profile_id, posted_at, description, merchant_name, amount, currency, classification_attempts, bank_account:bank_accounts(name, official_name, type, subtype)')
    .eq('profile_id', profileId)
    .eq('normalized_status', 'pending')
    .gte('posted_at', normalizedMinPostedAt)
    .order('posted_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (error) throw new Error(`No pude leer transacciones pendientes: ${error.message}`);

  const transactions = ((data || []) as BankTransactionRaw[]).filter((transaction) => (
    !deterministicOnly || isCuentaFreeToLikeUCardPayment(transaction) || isCreditCardPaymentCounterpart(transaction)
  ));
  const results: BankClassificationResult[] = [];

  for (const transaction of transactions) {
    results.push(await classifyOne({ supabase, transaction, googleApiKey }));
  }

  const remainingPending = await countPending({ supabase, profileId, minPostedAt: normalizedMinPostedAt });

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
