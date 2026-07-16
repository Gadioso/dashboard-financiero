import { NextResponse } from 'next/server';
import { processPendingBankTransactions } from '@/lib/bank-transaction-classifier';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const aiApiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function parseLimit(value: unknown) {
  const limit = Number(value);

  return Number.isFinite(limit) ? limit : null;
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

    const body = await request.json().catch(() => ({}));
    const retryFailed = (body as { retryFailed?: unknown }).retryFailed === true;
    const transactionId = typeof (body as { transactionId?: unknown }).transactionId === 'string'
      ? (body as { transactionId: string }).transactionId.trim()
      : null;
    const result = await processPendingBankTransactions({
      supabase,
      profileId: tenant.profileId,
      limit: parseLimit((body as { limit?: unknown }).limit),
      minPostedAt: typeof (body as { minPostedAt?: unknown }).minPostedAt === 'string'
        ? (body as { minPostedAt: string }).minPostedAt
        : undefined,
      googleApiKey: aiApiKey,
      retryFailed,
      transactionId,
    });

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank.transactions.classify',
      resourceType: 'bank_transactions_raw',
      metadata: {
        processed: result.processed,
        classified: result.classified,
        failed: result.failed,
        ignored: result.ignored,
        remainingPending: result.remainingPending,
        limit: result.limit,
        minPostedAt: typeof (body as { minPostedAt?: unknown }).minPostedAt === 'string'
          ? (body as { minPostedAt: string }).minPostedAt
          : undefined,
        retryFailed,
        transactionId,
      },
    });

    return NextResponse.json({ success: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'bank.transactions.classify',
      error,
    });
    const message = error instanceof Error ? error.message : 'No pude clasificar movimientos bancarios.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
