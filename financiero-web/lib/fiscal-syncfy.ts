import { createHash } from 'node:crypto';
import {
  createSyncfySession,
  getSyncfyAttachmentExtra,
  listSyncfyAttachments,
  listSyncfyTransactions,
  requestSyncfyCredentialPull,
  waitForSyncfyPull,
  type SyncfyAttachment,
  type SyncfyTransaction,
} from '@/lib/open-banking/syncfy';
import { interpretFiscalComplianceOpinion } from '@/lib/fiscal-compliance';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

type Supabase = NonNullable<ReturnType<typeof getSupabaseServiceClient>>;

type FiscalProfile = {
  id: string;
  rfc: string;
  legal_name: string;
};

type FiscalIntegration = {
  id: string;
  fiscal_profile_id: string | null;
  provider_connection_id: string | null;
  status: string;
};

type SyncfyFiscalDocument = {
  profile_id: string;
  business_entity_id: string | null;
  cfdi_uuid: string | null;
  xml_sha256: string;
  document_direction: 'issued' | 'received' | 'payroll' | 'unknown';
  version: string | null;
  issue_date: string | null;
  document_type: string | null;
  status: 'active' | 'cancelled' | 'unknown';
  issuer_rfc: string | null;
  issuer_name: string | null;
  receiver_rfc: string | null;
  receiver_name: string | null;
  currency: string;
  subtotal: number | null;
  total: number;
  discount: number | null;
  tax_transferred: number | null;
  tax_withheld: number | null;
  source: 'syncfy';
  provider: 'syncfy';
  provider_document_id: string;
  raw_metadata: Record<string, unknown>;
  updated_at: string;
};

type SyncfyFiscalProviderDocument = {
  profile_id: string;
  fiscal_profile_id: string;
  fiscal_integration_id: string;
  provider: 'syncfy';
  provider_document_id: string;
  document_type: 'cfdi_xml' | 'withholding' | 'monthly_declaration' | 'annual_declaration' | 'compliance_opinion' | 'tax_status_certificate' | 'other';
  status: 'available' | 'invalid';
  file_name: string | null;
  mime_type: string | null;
  provider_path: string | null;
  period: string | null;
  issued_at: string | null;
  raw_metadata: Record<string, unknown>;
  updated_at: string;
};

export const syncfySatAllInOneSiteId = '61c12b8cde3c034b3c8b25b1';
export const syncfyFiscalOrganizationType = '56cf4f5b784806cf028b4569';

function cleanText(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findNestedValue(value: unknown, candidateKeys: string[], depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth > 7) return undefined;
  const keys = new Set(candidateKeys.map(normalizeKey));

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(normalizeKey(key)) && nested !== null && nested !== undefined && nested !== '') return nested;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (nested && typeof nested === 'object') {
      const found = findNestedValue(nested, candidateKeys, depth + 1);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

function syncfyDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function hasKeyword(keywords: string[], expected: string) {
  return keywords.some((keyword) => keyword === expected || keyword.includes(expected));
}

function inferDirection(keywords: string[]) {
  if (hasKeyword(keywords, 'nomina') || hasKeyword(keywords, 'nómina')) return 'payroll' as const;
  if (hasKeyword(keywords, 'emitidas') || hasKeyword(keywords, 'emitida')) return 'issued' as const;
  if (hasKeyword(keywords, 'recibidas') || hasKeyword(keywords, 'recibida')) return 'received' as const;
  return 'unknown' as const;
}

function inferDocumentType(keywords: string[]) {
  if (hasKeyword(keywords, 'nomina') || hasKeyword(keywords, 'nómina')) return 'N';
  if (hasKeyword(keywords, 'pagos') || hasKeyword(keywords, 'pago')) return 'P';
  if (hasKeyword(keywords, 'egreso')) return 'E';
  if (hasKeyword(keywords, 'traslado')) return 'T';
  if (hasKeyword(keywords, 'ingreso')) return 'I';
  return null;
}

function inferVersion(keywords: string[], raw: SyncfyTransaction) {
  return cleanText(findNestedValue(raw, ['version']))
    || keywords.find((keyword) => /^\d\.\d$/.test(keyword))
    || null;
}

function rfcFrom(value: unknown) {
  const candidate = cleanText(value)?.toUpperCase() || null;
  return candidate && /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(candidate) ? candidate : null;
}

function fiscalProviderDocumentType(siteId: string | null, keywords: string[]) {
  if (siteId === '58543125784806c3298b4572') return 'monthly_declaration' as const;
  if (siteId === '59aefe28056f29793a58c091') return 'annual_declaration' as const;
  if (siteId === '59aefe28056f29793a58c092') return 'tax_status_certificate' as const;
  if (siteId === '5f6bbaa541273336c87d96c1') return 'compliance_opinion' as const;
  if (keywords.some((keyword) => keyword.includes('constancia') || keyword.includes('situacion fiscal') || keyword.includes('situación fiscal'))) return 'tax_status_certificate' as const;
  if (keywords.some((keyword) => keyword.includes('opinion') || keyword.includes('opinión') || keyword.includes('32-d'))) return 'compliance_opinion' as const;
  if (keywords.some((keyword) => keyword.includes('declaracion anual') || keyword.includes('declaración anual'))) return 'annual_declaration' as const;
  if (keywords.some((keyword) => keyword.includes('declaracion mensual') || keyword.includes('declaración mensual') || keyword.includes('provisional'))) return 'monthly_declaration' as const;
  if (keywords.some((keyword) => keyword.includes('retencion') || keyword.includes('retención'))) return 'withholding' as const;
  if (keywords.some((keyword) => keyword.includes('cfdi') || /^\d\.\d$/.test(keyword))) return 'cfdi_xml' as const;
  return 'other' as const;
}

function normalizeSyncfyFiscalAttachment({
  attachment,
  transaction,
  profileId,
  fiscalProfileId,
  integrationId,
}: {
  attachment: SyncfyAttachment;
  transaction?: SyncfyTransaction;
  profileId: string;
  fiscalProfileId: string;
  integrationId: string;
}): SyncfyFiscalProviderDocument | null {
  const providerDocumentId = cleanText(attachment.id_attachment ?? attachment.id);
  if (!providerDocumentId) return null;
  const keywords = [
    ...(Array.isArray(attachment.keywords) ? attachment.keywords : []),
    ...(Array.isArray(transaction?.keywords) ? transaction.keywords : []),
  ].map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean);
  const siteId = cleanText(attachment.id_site) || cleanText(transaction?.id_site);
  const issuedAt = syncfyDate(attachment.dt_create ?? attachment.dt_refresh ?? transaction?.dt_transaction ?? transaction?.dt_refresh);

  return {
    profile_id: profileId,
    fiscal_profile_id: fiscalProfileId,
    fiscal_integration_id: integrationId,
    provider: 'syncfy',
    provider_document_id: providerDocumentId,
    document_type: fiscalProviderDocumentType(siteId, keywords),
    status: attachment.is_valid === 0 || attachment.is_valid === false ? 'invalid' : 'available',
    file_name: cleanText(attachment.file),
    mime_type: cleanText(attachment.mime),
    provider_path: cleanText(attachment.url),
    period: issuedAt?.slice(0, 7) || null,
    issued_at: issuedAt,
    raw_metadata: {
      provider: 'syncfy',
      siteId,
      credentialId: cleanText(attachment.id_credential ?? transaction?.id_credential),
      transactionId: cleanText(attachment.id_transaction ?? transaction?.id_transaction),
      keywords,
      attachment,
    },
    updated_at: new Date().toISOString(),
  };
}

export function normalizeSyncfyFiscalTransaction({
  transaction,
  profileId,
  businessEntityId,
  fiscalProfile,
}: {
  transaction: SyncfyTransaction;
  profileId: string;
  businessEntityId?: string | null;
  fiscalProfile: Pick<FiscalProfile, 'rfc' | 'legal_name'>;
}): SyncfyFiscalDocument | null {
  const providerDocumentId = cleanText(transaction.id_transaction ?? transaction.id);
  if (!providerDocumentId) return null;

  const keywords = Array.isArray(transaction.keywords)
    ? transaction.keywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean)
    : [];
  const direction = inferDirection(keywords);
  const ownRfc = fiscalProfile.rfc.toUpperCase();
  const counterpartRfc = rfcFrom(transaction.extra?.tax_id)
    || rfcFrom(findNestedValue(transaction, ['tax_id', 'taxid', 'rfc']));
  const counterpartName = cleanText(transaction.description);
  const reference = cleanText(transaction.reference);
  const uuid = reference?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0]?.toUpperCase()
    || cleanText(findNestedValue(transaction, ['uuid', 'cfdi_uuid', 'uuidfiscal']))?.toUpperCase()
    || null;
  const rawTotal = asNumber(transaction.amount ?? findNestedValue(transaction, ['total'])) || 0;
  const cancelled = Boolean(transaction.is_disable || transaction.is_deleted)
    || hasKeyword(keywords, 'cancelada')
    || hasKeyword(keywords, 'cancelado');

  const issuerRfc = direction === 'issued' ? ownRfc : counterpartRfc;
  const issuerName = direction === 'issued' ? fiscalProfile.legal_name : counterpartName;
  const receiverRfc = direction === 'received' || direction === 'payroll' ? ownRfc : counterpartRfc;
  const receiverName = direction === 'received' || direction === 'payroll' ? fiscalProfile.legal_name : counterpartName;

  return {
    profile_id: profileId,
    business_entity_id: businessEntityId || null,
    cfdi_uuid: uuid,
    xml_sha256: createHash('sha256').update(`syncfy:${providerDocumentId}`).digest('hex'),
    document_direction: direction,
    version: inferVersion(keywords, transaction),
    issue_date: syncfyDate(transaction.dt_transaction ?? transaction.dt_accounting),
    document_type: inferDocumentType(keywords),
    status: cancelled ? 'cancelled' : keywords.length ? 'active' : 'unknown',
    issuer_rfc: issuerRfc,
    issuer_name: issuerName,
    receiver_rfc: receiverRfc,
    receiver_name: receiverName,
    currency: cleanText(transaction.currency) || 'MXN',
    subtotal: asNumber(findNestedValue(transaction, ['subtotal', 'sub_total'])),
    total: Math.abs(rawTotal),
    discount: asNumber(findNestedValue(transaction, ['discount', 'descuento'])),
    tax_transferred: asNumber(findNestedValue(transaction, ['tax_transferred', 'totalimpuestostrasladados', 'impuestostrasladados'])),
    tax_withheld: asNumber(findNestedValue(transaction, ['tax_withheld', 'totalimpuestosretenidos', 'impuestosretenidos'])),
    source: 'syncfy',
    provider: 'syncfy',
    provider_document_id: providerDocumentId,
    raw_metadata: {
      provider: 'syncfy',
      providerDocumentId,
      credentialId: cleanText(transaction.id_credential),
      siteId: cleanText(transaction.id_site),
      keywords,
      attachments: transaction.attachments || [],
      transaction,
    },
    updated_at: new Date().toISOString(),
  };
}

export async function syncSyncfyFiscalProfile({
  supabase,
  profileId,
  credentialId,
  pullBeforeRead = true,
}: {
  supabase: Supabase;
  profileId: string;
  credentialId?: string | null;
  pullBeforeRead?: boolean;
}) {
  const [userResult, profileResult, integrationResult] = await Promise.all([
    supabase.from('syncfy_users').select('syncfy_user_id').eq('profile_id', profileId).maybeSingle(),
    supabase.from('fiscal_profiles').select('id, business_entity_id, rfc, legal_name').eq('profile_id', profileId).eq('status', 'active').limit(1).maybeSingle(),
    supabase.from('fiscal_integrations').select('id, fiscal_profile_id, provider_connection_id, status').eq('profile_id', profileId).eq('provider', 'syncfy').eq('integration_type', 'open_fiscal').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (userResult.error) throw new Error(`No pude leer el usuario Syncfy: ${userResult.error.message}`);
  if (profileResult.error) throw new Error(`No pude leer el expediente fiscal: ${profileResult.error.message}`);
  if (integrationResult.error) throw new Error(`No pude leer la conexión fiscal: ${integrationResult.error.message}`);
  if (!userResult.data?.syncfy_user_id) throw new Error('Primero inicia la conexión segura con Syncfy.');
  if (!profileResult.data) throw new Error('Primero completa tu expediente fiscal.');
  if (!integrationResult.data) throw new Error('Primero conecta tu cuenta del SAT con Syncfy.');

  const fiscalProfile = profileResult.data as FiscalProfile & { business_entity_id?: string | null };
  const integration = integrationResult.data as FiscalIntegration;
  const resolvedCredentialId = credentialId || integration.provider_connection_id;
  if (!resolvedCredentialId) throw new Error('Syncfy todavía no devolvió la credencial fiscal.');

  const session = await createSyncfySession(userResult.data.syncfy_user_id);
  let pullRequested = false;
  let pullCompleted = false;
  let warning: string | null = null;

  if (pullBeforeRead) {
    const pull = await requestSyncfyCredentialPull(session.token, resolvedCredentialId);
    pullRequested = true;
    const result = await waitForSyncfyPull(session.token, pull.id_job, { attempts: 12, intervalMs: 1_500 });
    pullCompleted = result.completed;
    if (!pullCompleted) warning = 'Syncfy sigue descargando información del SAT; el webhook completará la actualización.';
  }

  const [transactions, attachments] = await Promise.all([
    listSyncfyTransactions(session.token, { idCredential: resolvedCredentialId, limit: 5_000 }),
    listSyncfyAttachments(session.token, { idCredential: resolvedCredentialId, limit: 5_000 }),
  ]);
  const documents = transactions
    .map((transaction) => normalizeSyncfyFiscalTransaction({
      transaction,
      profileId,
      businessEntityId: fiscalProfile.business_entity_id,
      fiscalProfile,
    }))
    .filter((document): document is SyncfyFiscalDocument => Boolean(document));

  let saved = 0;
  if (documents.length) {
    const { data, error } = await supabase
      .from('cfdi_documents')
      .upsert(documents, { onConflict: 'profile_id,provider,provider_document_id' })
      .select('id');
    if (error) throw new Error(`No pude guardar los CFDI de Syncfy: ${error.message}`);
    saved = data?.length || 0;
  }

  const transactionsById = new Map(transactions.map((transaction) => [cleanText(transaction.id_transaction), transaction]));
  const transactionsByAttachment = new Map<string, SyncfyTransaction>();
  for (const transaction of transactions) {
    for (const attachment of transaction.attachments || []) {
      const attachmentId = cleanText(attachment.id_attachment);
      if (attachmentId) transactionsByAttachment.set(attachmentId, transaction);
    }
  }
  const providerDocuments = attachments
    .map((attachment) => {
      const attachmentId = cleanText(attachment.id_attachment ?? attachment.id);
      const transactionId = cleanText(attachment.id_transaction);
      const transaction = (transactionId ? transactionsById.get(transactionId) : undefined)
        || (attachmentId ? transactionsByAttachment.get(attachmentId) : undefined);
      return normalizeSyncfyFiscalAttachment({
        attachment,
        transaction,
        profileId,
        fiscalProfileId: fiscalProfile.id,
        integrationId: integration.id,
      });
    })
    .filter((document): document is SyncfyFiscalProviderDocument => Boolean(document));
  for (const document of providerDocuments) {
    if (document.document_type !== 'compliance_opinion') continue;
    try {
      const providerExtra = await getSyncfyAttachmentExtra(session.token, document.provider_document_id);
      document.raw_metadata = { ...document.raw_metadata, providerExtra };
    } catch (error: unknown) {
      document.raw_metadata = {
        ...document.raw_metadata,
        interpretationWarning: error instanceof Error ? error.message : 'Syncfy no entregó datos interpretables de la opinión 32-D.',
      };
    }
  }
  let providerDocumentsSaved = 0;
  let opinionsInterpreted = 0;
  let alertsGenerated = 0;
  let savedProviderDocuments: Array<{
    id: string;
    provider_document_id: string;
    document_type: string;
    issued_at: string | null;
    raw_metadata: Record<string, unknown>;
  }> = [];
  if (providerDocuments.length) {
    const { data, error } = await supabase
      .from('fiscal_provider_documents')
      .upsert(providerDocuments, { onConflict: 'profile_id,provider,provider_document_id' })
      .select('id, provider_document_id, document_type, issued_at, raw_metadata');
    if (error) throw new Error(`No pude guardar los documentos fiscales de Syncfy: ${error.message}`);
    providerDocumentsSaved = data?.length || 0;
    savedProviderDocuments = (data || []) as typeof savedProviderDocuments;
  }

  for (const document of savedProviderDocuments.filter((item) => item.document_type === 'compliance_opinion')) {
    const interpretation = interpretFiscalComplianceOpinion(document.raw_metadata);
    const checkedAt = document.issued_at || new Date().toISOString();
    const opinionResult = await supabase
      .from('fiscal_compliance_opinions')
      .upsert({
        profile_id: profileId,
        fiscal_profile_id: fiscalProfile.id,
        fiscal_provider_document_id: document.id,
        opinion_status: interpretation.status,
        checked_at: checkedAt,
        omitted_obligations: interpretation.omittedObligations,
        source: 'syncfy_open_fiscal',
        raw_metadata: {
          providerDocumentId: document.provider_document_id,
          confidence: interpretation.confidence,
          evidence: interpretation.evidence,
        },
      }, { onConflict: 'profile_id,source,fiscal_provider_document_id' });
    if (opinionResult.error) throw new Error(`No pude guardar la interpretación 32-D: ${opinionResult.error.message}`);
    opinionsInterpreted += 1;

    if (interpretation.status === 'positive') {
      const resolved = await supabase
        .from('fiscal_alerts')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .eq('alert_type', 'compliance')
        .eq('status', 'active');
      if (resolved.error) throw new Error(`No pude cerrar alertas 32-D anteriores: ${resolved.error.message}`);
      continue;
    }

    const unavailable = interpretation.status === 'unavailable';
    const sourceKey = `syncfy:32d:${document.provider_document_id}`;
    const alertResult = await supabase
      .from('fiscal_alerts')
      .upsert({
        profile_id: profileId,
        fiscal_profile_id: fiscalProfile.id,
        alert_type: 'compliance',
        severity: unavailable ? 'info' : 'critical',
        title: unavailable ? 'Opinión 32-D disponible para revisión' : 'Opinión 32-D negativa',
        description: unavailable
          ? 'Syncfy descargó la opinión, pero el documento no expuso texto estructurado suficiente. Descárgala y revísala manualmente.'
          : interpretation.omittedObligations.length
            ? `Obligaciones detectadas: ${interpretation.omittedObligations.join('; ').slice(0, 1_500)}`
            : 'La información estructurada de Syncfy indica una opinión de cumplimiento negativa. Revisa el documento descargado.',
        status: 'active',
        detected_at: checkedAt,
        source_key: sourceKey,
        metadata: {
          provider: 'syncfy',
          fiscalProviderDocumentId: document.id,
          providerDocumentId: document.provider_document_id,
          confidence: interpretation.confidence,
          evidence: interpretation.evidence,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id,source_key' });
    if (alertResult.error) throw new Error(`No pude guardar la alerta 32-D: ${alertResult.error.message}`);
    alertsGenerated += 1;
  }

  const now = new Date().toISOString();
  const integrationUpdate = await supabase
    .from('fiscal_integrations')
    .update({
      status: 'active',
      provider_connection_id: resolvedCredentialId,
      last_sync_at: now,
      last_error: null,
      metadata: {
        product: 'sat_all_in_one',
        siteId: syncfySatAllInOneSiteId,
        transactions: transactions.length,
        attachments: attachments.length,
        saved,
        providerDocumentsSaved,
        opinionsInterpreted,
        alertsGenerated,
        pullRequested,
        pullCompleted,
        warning,
      },
      updated_at: now,
    })
    .eq('id', integration.id)
    .eq('profile_id', profileId);
  if (integrationUpdate.error) throw new Error(`No pude actualizar la conexión fiscal: ${integrationUpdate.error.message}`);

  return {
    provider: 'syncfy' as const,
    credentialId: resolvedCredentialId,
    transactions: transactions.length,
    attachments: attachments.length,
    saved,
    providerDocumentsSaved,
    opinionsInterpreted,
    alertsGenerated,
    pullRequested,
    pullCompleted,
    warning,
  };
}
