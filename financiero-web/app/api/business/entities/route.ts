import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const entityTypes = new Set(['personal_activity', 'freelancer', 'business', 'firm_client', 'other']);
const statuses = new Set(['active', 'paused', 'archived']);

function cleanText(value: unknown, maxLength: number) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanCode(value: unknown, fallback: string, maxLength = 12) {
  const cleaned = cleanText(value, maxLength)?.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

  return cleaned || fallback;
}

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('business_entities')
      .select('id, name, entity_type, country, currency, tax_id, tax_regime, status, metadata, created_at, updated_at')
      .eq('profile_id', tenant.profileId)
      .order('created_at', { ascending: false });

    if (tableMissing(error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (error) {
      throw new Error(`No pude leer entidades de negocio: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      profileScoped: true,
      businessEntities: data || [],
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, action: 'business.entities.list', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = cleanText(body.name, 120);
    const entityType = cleanText(body.entityType ?? body.entity_type, 40) || 'freelancer';
    const status = cleanText(body.status, 30) || 'active';

    if (!name) {
      return NextResponse.json({ success: false, error: 'El nombre de la entidad es obligatorio.' }, { status: 400 });
    }

    if (!entityTypes.has(entityType)) {
      return NextResponse.json({ success: false, error: 'Tipo de entidad inválido.' }, { status: 400 });
    }

    if (!statuses.has(status)) {
      return NextResponse.json({ success: false, error: 'Estado inválido.' }, { status: 400 });
    }

    const payload = {
      profile_id: profileId,
      name,
      entity_type: entityType,
      country: cleanCode(body.country, 'MX', 2),
      currency: cleanCode(body.currency, 'MXN', 3),
      tax_id: cleanText(body.taxId ?? body.tax_id, 30),
      tax_regime: cleanText(body.taxRegime ?? body.tax_regime, 120),
      status,
      metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('business_entities')
      .insert([payload])
      .select('id, name, entity_type, country, currency, tax_id, tax_regime, status, metadata, created_at, updated_at')
      .single();

    if (tableMissing(error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración agentic foundation.',
        migration: '20260630_agentic_business_wealth_foundation.sql',
      }, { status: 409 });
    }

    if (error) {
      throw new Error(`No pude crear entidad de negocio: ${error.message}`);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: 'business.entities.create',
      resourceType: 'business_entity',
      resourceId: data.id,
      metadata: {
        entityType,
        status,
      },
    });

    return NextResponse.json({ success: true, businessEntity: data }, { status: 201 });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'business.entities.create', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
