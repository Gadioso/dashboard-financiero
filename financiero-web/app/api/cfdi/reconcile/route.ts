import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type MatchStatus = 'candidate' | 'matched' | 'needs_review' | 'missing_bank_movement' | 'missing_cfdi';

type CfdiDocument = {
  id: string;
  business_entity_id?: string | null;
  cfdi_uuid?: string | null;
  document_direction: string;
  issue_date?: string | null;
  issuer_rfc?: string | null;
  issuer_name?: string | null;
  receiver_rfc?: string | null;
  receiver_name?: string | null;
  total?: number | string | null;
  currency?: string | null;
};

type MovementCandidate = {
  id: number | string;
  kind: 'gasto' | 'ingreso' | 'bank';
  amount: number;
  date?: string | null;
  label?: string | null;
  bankSign?: number;
};

const defaultLimit = 50;
const maxLimit = 200;
const defaultDateToleranceDays = 7;
const defaultAmountTolerance = 2;

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

function normalizeLimit(value?: number | null) {
  const requested = Number(value || defaultLimit);
  if (!Number.isFinite(requested) || requested <= 0) return defaultLimit;
  return Math.min(Math.floor(requested), maxLimit);
}

function dayKey(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dayDelta(a?: string | null, b?: string | null) {
  const left = dayKey(a);
  const right = dayKey(b);
  if (left === null || right === null) return null;
  return Math.round(Math.abs(left - right) / 86_400_000);
}

function normalizeAmount(value?: number | string | null) {
  const parsed = Math.abs(Number(value || 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusForConfidence(confidence: number): MatchStatus {
  if (confidence >= 0.97) return 'matched';
  if (confidence >= 0.85) return 'needs_review';
  return 'candidate';
}

function scoreCandidate({
  cfdi,
  candidate,
  amountTolerance,
  dateToleranceDays,
}: {
  cfdi: CfdiDocument;
  candidate: MovementCandidate;
  amountTolerance: number;
  dateToleranceDays: number;
}) {
  const cfdiTotal = normalizeAmount(cfdi.total);
  const amountDelta = Math.abs(cfdiTotal - normalizeAmount(candidate.amount));
  const dateDeltaDays = dayDelta(cfdi.issue_date, candidate.date);

  if (!cfdiTotal || amountDelta > amountTolerance) return null;
  if (dateDeltaDays !== null && dateDeltaDays > dateToleranceDays) return null;

  const amountScore = Math.max(0, 1 - amountDelta / Math.max(cfdiTotal, 1));
  const dateScore = dateDeltaDays === null ? 0.82 : Math.max(0, 1 - dateDeltaDays / Math.max(dateToleranceDays + 1, 1));
  const signScore = candidate.kind !== 'bank'
    ? 1
    : cfdi.document_direction === 'issued'
      ? candidate.bankSign && candidate.bankSign < 0 ? 1 : 0.72
      : cfdi.document_direction === 'received'
        ? candidate.bankSign && candidate.bankSign > 0 ? 1 : 0.72
        : 0.86;
  const confidence = Number(Math.min(0.99, amountScore * 0.58 + dateScore * 0.27 + signScore * 0.15).toFixed(4));

  return {
    confidence,
    amountDelta: Number(amountDelta.toFixed(2)),
    dateDeltaDays,
    matchStatus: statusForConfidence(confidence),
  };
}

function shouldMatchExpenses(direction: string) {
  return direction === 'received' || direction === 'payroll' || direction === 'unknown';
}

function shouldMatchIncome(direction: string) {
  return direction === 'issued' || direction === 'unknown';
}

function eventKey(event: {
  cfdi_document_id: string;
  gasto_id?: number | string | null;
  ingreso_id?: number | string | null;
  bank_transaction_raw_id?: number | string | null;
  match_status: string;
}) {
  return [
    event.cfdi_document_id,
    event.gasto_id || '',
    event.ingreso_id || '',
    event.bank_transaction_raw_id || '',
    event.match_status,
  ].join(':');
}

export async function GET(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const { data, error } = await supabase
      .from('cfdi_reconciliation_events')
      .select('id, cfdi_document_id, gasto_id, ingreso_id, bank_transaction_raw_id, match_status, confidence, amount_delta, date_delta_days, evidence, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (tableMissing(error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración CFDI foundation.',
        migration: '20260630190922_cfdi_manual_ingest_foundation.sql',
      }, { status: 409 });
    }

    if (error) throw new Error(`No pude leer conciliaciones CFDI: ${error.message}`);

    return NextResponse.json({ success: true, events: data || [] });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'cfdi_reconciliation.list', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;
    if (!profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      dateToleranceDays?: number;
      amountTolerance?: number;
    };
    const limit = normalizeLimit(body.limit);
    const dateToleranceDays = Math.max(0, Math.min(Number(body.dateToleranceDays || defaultDateToleranceDays), 45));
    const amountTolerance = Math.max(0, Math.min(Number(body.amountTolerance || defaultAmountTolerance), 500));

    const { data: cfdiDocuments, error: cfdiError } = await supabase
      .from('cfdi_documents')
      .select('id, business_entity_id, cfdi_uuid, document_direction, issue_date, issuer_rfc, issuer_name, receiver_rfc, receiver_name, total, currency')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .order('issue_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tableMissing(cfdiError)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración CFDI foundation.',
        migration: '20260630190922_cfdi_manual_ingest_foundation.sql',
      }, { status: 409 });
    }
    if (cfdiError) throw new Error(`No pude leer CFDI: ${cfdiError.message}`);

    const cfdis = (cfdiDocuments || []) as CfdiDocument[];

    if (cfdis.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        created: 0,
        matched: 0,
        needsReview: 0,
        missing: 0,
        events: [],
      });
    }

    const [gastosResult, ingresosResult, bankResult, existingResult] = await Promise.all([
      supabase.from('gastos').select('id, concepto, monto, fecha').eq('profile_id', profileId).order('fecha', { ascending: false }).limit(500),
      supabase.from('ingresos').select('id, concepto, monto, fecha').eq('profile_id', profileId).order('fecha', { ascending: false }).limit(500),
      supabase.from('bank_transactions_raw').select('id, description, merchant_name, amount, posted_at, currency').eq('profile_id', profileId).order('posted_at', { ascending: false, nullsFirst: false }).limit(800),
      supabase.from('cfdi_reconciliation_events').select('cfdi_document_id, gasto_id, ingreso_id, bank_transaction_raw_id, match_status').eq('profile_id', profileId).limit(5000),
    ]);

    if (gastosResult.error) throw new Error(`No pude leer gastos: ${gastosResult.error.message}`);
    if (ingresosResult.error) throw new Error(`No pude leer ingresos: ${ingresosResult.error.message}`);
    if (!tableMissing(bankResult.error) && bankResult.error) throw new Error(`No pude leer movimientos bancarios: ${bankResult.error.message}`);
    if (existingResult.error) throw new Error(`No pude leer conciliaciones existentes: ${existingResult.error.message}`);

    const gastos: MovementCandidate[] = (gastosResult.data || []).map((row) => ({
      id: row.id,
      kind: 'gasto',
      amount: normalizeAmount(row.monto),
      date: row.fecha,
      label: row.concepto,
    }));
    const ingresos: MovementCandidate[] = (ingresosResult.data || []).map((row) => ({
      id: row.id,
      kind: 'ingreso',
      amount: normalizeAmount(row.monto),
      date: row.fecha,
      label: row.concepto,
    }));
    const banks: MovementCandidate[] = tableMissing(bankResult.error)
      ? []
      : (bankResult.data || []).map((row) => ({
          id: row.id,
          kind: 'bank',
          amount: normalizeAmount(row.amount),
          date: row.posted_at,
          label: row.merchant_name || row.description,
          bankSign: Number(row.amount || 0),
        }));
    const existing = new Set((existingResult.data || []).map(eventKey));
    const events = [];

    for (const cfdi of cfdis) {
      const candidatePools: MovementCandidate[] = [
        ...(shouldMatchExpenses(cfdi.document_direction) ? gastos : []),
        ...(shouldMatchIncome(cfdi.document_direction) ? ingresos : []),
        ...banks,
      ];
      const scored = candidatePools
        .map((candidate) => ({ candidate, score: scoreCandidate({ cfdi, candidate, amountTolerance, dateToleranceDays }) }))
        .filter((item): item is { candidate: MovementCandidate; score: NonNullable<ReturnType<typeof scoreCandidate>> } => Boolean(item.score))
        .sort((left, right) => right.score.confidence - left.score.confidence)
        .slice(0, 3);

      if (scored.length === 0) {
        const missingStatus: MatchStatus = cfdi.document_direction === 'issued' ? 'missing_bank_movement' : 'missing_bank_movement';
        const event = {
          profile_id: profileId,
          business_entity_id: cfdi.business_entity_id || null,
          cfdi_document_id: cfdi.id,
          match_status: missingStatus,
          confidence: 0,
          amount_delta: null,
          date_delta_days: null,
          evidence: {
            source: 'cfdi_reconcile_v1',
            reason: 'no_candidate_within_tolerance',
            cfdiTotal: normalizeAmount(cfdi.total),
            cfdiUuid: cfdi.cfdi_uuid,
            dateToleranceDays,
            amountTolerance,
          },
        };

        if (!existing.has(eventKey(event))) events.push(event);
        continue;
      }

      for (const { candidate, score } of scored) {
        const event = {
          profile_id: profileId,
          business_entity_id: cfdi.business_entity_id || null,
          cfdi_document_id: cfdi.id,
          gasto_id: candidate.kind === 'gasto' ? candidate.id : null,
          ingreso_id: candidate.kind === 'ingreso' ? candidate.id : null,
          bank_transaction_raw_id: candidate.kind === 'bank' ? candidate.id : null,
          match_status: score.matchStatus,
          confidence: score.confidence,
          amount_delta: score.amountDelta,
          date_delta_days: score.dateDeltaDays,
          evidence: {
            source: 'cfdi_reconcile_v1',
            candidateKind: candidate.kind,
            candidateLabel: candidate.label,
            candidateAmount: candidate.amount,
            candidateDate: candidate.date,
            cfdiUuid: cfdi.cfdi_uuid,
            cfdiTotal: normalizeAmount(cfdi.total),
            cfdiDirection: cfdi.document_direction,
          },
        };

        if (!existing.has(eventKey(event))) events.push(event);
      }
    }

    const { data: inserted, error: insertError } = events.length > 0
      ? await supabase
          .from('cfdi_reconciliation_events')
          .insert(events)
          .select('id, cfdi_document_id, gasto_id, ingreso_id, bank_transaction_raw_id, match_status, confidence, amount_delta, date_delta_days, evidence, created_at')
      : { data: [], error: null };

    if (insertError) throw new Error(`No pude guardar conciliaciones CFDI: ${insertError.message}`);

    const createdEvents = inserted || [];

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'cfdi_reconciliation.run',
      resourceType: 'workflow',
      resourceId: 'cfdi_reconcile_v1',
      metadata: {
        processed: cfdis.length,
        created: createdEvents.length,
        dateToleranceDays,
        amountTolerance,
      },
    });

    return NextResponse.json({
      success: true,
      processed: cfdis.length,
      created: createdEvents.length,
      matched: createdEvents.filter((event) => event.match_status === 'matched').length,
      needsReview: createdEvents.filter((event) => event.match_status === 'needs_review').length,
      missing: createdEvents.filter((event) => String(event.match_status).startsWith('missing_')).length,
      events: createdEvents,
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'cfdi_reconciliation.run', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
