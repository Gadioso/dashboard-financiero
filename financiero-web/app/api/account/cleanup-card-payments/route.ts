import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type CardPaymentCandidate = {
  id: string;
  concepto: string | null;
  monto: number | string | null;
  tarjeta?: string | null;
  origen?: string | null;
  fecha: string;
};

function isSuspiciousCardPayment(row: CardPaymentCandidate) {
  const concept = String(row.concepto || '').toLowerCase();
  const amount = Number(row.monto || 0);

  return amount >= 100000 ||
    /(?:l[ií]nea de cr[eé]dito|cr[eé]dito preaprobado|aprovecha|promoci[oó]n|oferta|beneficio|sin concepto|movimiento santander)/i.test(concept);
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let profileId: string | null = null;
  let actorEmail: string | null = null;

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email || null;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      apply?: boolean;
      date?: string;
      minAmount?: number;
    };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : '2026-06-14';
    const minAmount = Number.isFinite(body.minAmount) ? Number(body.minAmount) : 100000;
    const start = new Date(`${date}T00:00:00.000Z`).toISOString();
    const endDate = new Date(`${date}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = endDate.toISOString();
    const query = supabase
      .from('abonos_tarjeta_credito')
      .select('id, concepto, monto, tarjeta, origen, fecha')
      .gte('fecha', start)
      .lt('fecha', end)
      .gte('monto', minAmount)
      .order('monto', { ascending: false });
    const { data, error } = await applyProfileFilter(query, profileId);

    if (error) {
      throw new Error(error.message);
    }

    const candidates = ((data || []) as CardPaymentCandidate[]).filter(isSuspiciousCardPayment);

    if (!body.apply) {
      return NextResponse.json({
        success: true,
        mode: 'dry-run',
        deleted: 0,
        candidates,
      });
    }

    const ids = candidates.map((candidate) => candidate.id);

    if (!ids.length) {
      return NextResponse.json({ success: true, mode: 'apply', deleted: 0, ids: [] });
    }

    const deleteQuery = supabase
      .from('abonos_tarjeta_credito')
      .delete()
      .in('id', ids)
      .select('id');
    const { data: deletedRows, error: deleteError } = await applyProfileFilter(deleteQuery, profileId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'card_payment.cleanup_suspicious',
      resourceType: 'abonos_tarjeta_credito',
      metadata: {
        date,
        minAmount,
        ids,
      },
    });

    return NextResponse.json({
      success: true,
      mode: 'apply',
      deleted: deletedRows?.length || 0,
      ids: (deletedRows || []).map((row) => row.id),
    });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'card_payment.cleanup_suspicious',
      error,
    });
    const message = error instanceof Error ? error.message : 'No pude limpiar abonos sospechosos.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
