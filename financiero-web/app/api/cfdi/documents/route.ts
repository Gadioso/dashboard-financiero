import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type CfdiDirection = 'issued' | 'received' | 'payroll' | 'unknown';

const allowedDirections = new Set<CfdiDirection>(['issued', 'received', 'payroll', 'unknown']);

function findTag(xml: string, tagName: string) {
  const pattern = new RegExp(`<[\\w:-]*${tagName}\\b([^>]*)>`, 'i');
  return xml.match(pattern)?.[1] || '';
}

function findAttr(source: string, attrName: string) {
  const pattern = new RegExp(`(?:^|\\s)(?:[\\w]+:)?${attrName}="([^"]*)"`, 'i');
  return source.match(pattern)?.[1]?.trim() || null;
}

function parseMoney(value?: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstTaxTotal(xml: string, attrName: string) {
  const pattern = new RegExp(`<[\\w:-]*Impuestos\\b[^>]*${attrName}="([^"]*)"`, 'i');
  return parseMoney(xml.match(pattern)?.[1] || null);
}

function normalizeRfc(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function inferDirection({
  requestedDirection,
  businessTaxId,
  issuerRfc,
  receiverRfc,
}: {
  requestedDirection: CfdiDirection;
  businessTaxId?: string | null;
  issuerRfc?: string | null;
  receiverRfc?: string | null;
}): CfdiDirection {
  const normalizedTaxId = normalizeRfc(businessTaxId);

  if (normalizedTaxId && normalizeRfc(issuerRfc) === normalizedTaxId) return 'issued';
  if (normalizedTaxId && normalizeRfc(receiverRfc) === normalizedTaxId) return 'received';

  return requestedDirection;
}

function parseCfdiXml(xml: string) {
  const comprobante = findTag(xml, 'Comprobante');
  const emisor = findTag(xml, 'Emisor');
  const receptor = findTag(xml, 'Receptor');
  const timbre = findTag(xml, 'TimbreFiscalDigital');

  if (!comprobante || !emisor || !receptor) {
    throw new Error('El XML no parece ser un CFDI válido: faltan Comprobante, Emisor o Receptor.');
  }

  return {
    cfdi_uuid: findAttr(timbre, 'UUID'),
    version: findAttr(comprobante, 'Version'),
    serie: findAttr(comprobante, 'Serie'),
    folio: findAttr(comprobante, 'Folio'),
    issue_date: parseDate(findAttr(comprobante, 'Fecha')),
    certified_at: parseDate(findAttr(timbre, 'FechaTimbrado')),
    document_type: findAttr(comprobante, 'TipoDeComprobante'),
    issuer_rfc: normalizeRfc(findAttr(emisor, 'Rfc')),
    issuer_name: findAttr(emisor, 'Nombre'),
    receiver_rfc: normalizeRfc(findAttr(receptor, 'Rfc')),
    receiver_name: findAttr(receptor, 'Nombre'),
    usage_cfdi: findAttr(receptor, 'UsoCFDI'),
    payment_method: findAttr(comprobante, 'MetodoPago'),
    payment_form: findAttr(comprobante, 'FormaPago'),
    currency: findAttr(comprobante, 'Moneda'),
    subtotal: parseMoney(findAttr(comprobante, 'SubTotal')),
    total: parseMoney(findAttr(comprobante, 'Total')),
    discount: parseMoney(findAttr(comprobante, 'Descuento')),
    tax_transferred: firstTaxTotal(xml, 'TotalImpuestosTrasladados'),
    tax_withheld: firstTaxTotal(xml, 'TotalImpuestosRetenidos'),
  };
}

function tableMissing(error?: { code?: string; message?: string } | null) {
  return error?.code === '42P01' || /schema cache|does not exist|Could not find/i.test(error?.message || '');
}

export async function GET(request: Request) {
  let profileId: string | null = null;
  let actorEmail: string | null | undefined;

  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('cfdi_documents')
      .select('id, business_entity_id, cfdi_uuid, document_direction, version, serie, folio, issue_date, certified_at, document_type, status, issuer_rfc, issuer_name, receiver_rfc, receiver_name, currency, subtotal, total, tax_transferred, tax_withheld, created_at')
      .eq('profile_id', profileId)
      .order('issue_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (tableMissing(error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración CFDI foundation.',
        migration: '20260630190922_cfdi_manual_ingest_foundation.sql',
      }, { status: 409 });
    }

    if (error) throw new Error(`No pude leer CFDI: ${error.message}`);

    return NextResponse.json({ success: true, documents: data || [] });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'cfdi_documents.list', error });
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
      return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);
    profileId = tenant.profileId;
    actorEmail = tenant.email;

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      xml?: string;
      businessEntityId?: string | null;
      documentDirection?: CfdiDirection;
    };
    const xml = body.xml?.trim() || '';
    const requestedDirection = allowedDirections.has(body.documentDirection || 'unknown') ? body.documentDirection || 'unknown' : 'unknown';

    if (!xml || xml.length < 120) {
      return NextResponse.json({ success: false, error: 'Pega un XML CFDI válido.' }, { status: 400 });
    }

    if (xml.length > 1_000_000) {
      return NextResponse.json({ success: false, error: 'El XML excede el límite de 1 MB para carga manual.' }, { status: 413 });
    }

    const businessEntityId = body.businessEntityId?.trim() || null;
    let businessTaxId: string | null = null;

    if (businessEntityId) {
      const { data: businessEntity, error: businessError } = await supabase
        .from('business_entities')
        .select('id, tax_id')
        .eq('id', businessEntityId)
        .eq('profile_id', profileId)
        .maybeSingle();

      if (businessError) throw new Error(`No pude validar la entidad de negocio: ${businessError.message}`);
      if (!businessEntity) return NextResponse.json({ success: false, error: 'No encontré esa entidad de negocio.' }, { status: 404 });
      businessTaxId = businessEntity.tax_id || null;
    }

    const parsed = parseCfdiXml(xml);
    const xmlSha256 = createHash('sha256').update(xml).digest('hex');
    const direction = inferDirection({
      requestedDirection,
      businessTaxId,
      issuerRfc: parsed.issuer_rfc,
      receiverRfc: parsed.receiver_rfc,
    });
    const payload = {
      ...parsed,
      profile_id: profileId,
      business_entity_id: businessEntityId,
      xml_sha256: xmlSha256,
      document_direction: direction,
      raw_metadata: {
        uploadedManually: true,
        hasXmlStored: false,
      },
      updated_at: new Date().toISOString(),
    };

    const existingQuery = parsed.cfdi_uuid
      ? supabase.from('cfdi_documents').select('id').eq('profile_id', profileId).eq('cfdi_uuid', parsed.cfdi_uuid).maybeSingle()
      : supabase.from('cfdi_documents').select('id').eq('profile_id', profileId).eq('xml_sha256', xmlSha256).maybeSingle();
    const existing = await existingQuery;

    if (tableMissing(existing.error)) {
      return NextResponse.json({
        success: false,
        error: 'Falta aplicar la migración CFDI foundation.',
        migration: '20260630190922_cfdi_manual_ingest_foundation.sql',
      }, { status: 409 });
    }

    if (existing.error) throw new Error(`No pude revisar duplicados CFDI: ${existing.error.message}`);

    const result = existing.data?.id
      ? await supabase
          .from('cfdi_documents')
          .update(payload)
          .eq('id', existing.data.id)
          .eq('profile_id', profileId)
          .select('id, business_entity_id, cfdi_uuid, document_direction, version, serie, folio, issue_date, certified_at, document_type, status, issuer_rfc, issuer_name, receiver_rfc, receiver_name, currency, subtotal, total, tax_transferred, tax_withheld, created_at')
          .maybeSingle()
      : await supabase
          .from('cfdi_documents')
          .insert(payload)
          .select('id, business_entity_id, cfdi_uuid, document_direction, version, serie, folio, issue_date, certified_at, document_type, status, issuer_rfc, issuer_name, receiver_rfc, receiver_name, currency, subtotal, total, tax_transferred, tax_withheld, created_at')
          .maybeSingle();

    if (result.error) throw new Error(`No pude guardar CFDI: ${result.error.message}`);
    if (!result.data) throw new Error('Supabase no devolvió el CFDI guardado.');

    await logAuditEvent({
      supabase,
      request,
      profileId,
      actorEmail,
      action: existing.data?.id ? 'cfdi_document.update' : 'cfdi_document.create',
      resourceType: 'cfdi_documents',
      resourceId: result.data.id,
      metadata: {
        cfdi_uuid: parsed.cfdi_uuid,
        xml_sha256: xmlSha256,
        document_direction: direction,
      },
    });

    return NextResponse.json({ success: true, document: result.data });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({ supabase, request, profileId, actorEmail, action: 'cfdi_documents.create', error });
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
