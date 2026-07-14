import { NextResponse } from 'next/server';
import { createSyncfySession, listSyncfyAttachments } from '@/lib/open-banking/syncfy';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function cleanFileName(value: string | null | undefined) {
  const candidate = (value || 'documento-fiscal').replace(/[\r\n"\\/]/g, '-').trim();
  return candidate || 'documento-fiscal';
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

  const { id } = await context.params;
  const documentResult = await supabase
    .from('fiscal_provider_documents')
    .select('id, provider, provider_document_id, file_name, mime_type, fiscal_integration_id')
    .eq('id', id)
    .eq('profile_id', tenant.profileId)
    .maybeSingle();
  if (documentResult.error) return NextResponse.json({ success: false, error: 'No pude consultar el documento fiscal.' }, { status: 500 });
  if (!documentResult.data) return NextResponse.json({ success: false, error: 'Documento fiscal no encontrado.' }, { status: 404 });
  const fiscalDocument = documentResult.data;
  if (fiscalDocument.provider !== 'syncfy') return NextResponse.json({ success: false, error: 'Proveedor documental no soportado.' }, { status: 409 });

  const [userResult, integrationResult] = await Promise.all([
    supabase.from('syncfy_users').select('syncfy_user_id').eq('profile_id', tenant.profileId).maybeSingle(),
    supabase.from('fiscal_integrations').select('provider_connection_id').eq('id', fiscalDocument.fiscal_integration_id).eq('profile_id', tenant.profileId).maybeSingle(),
  ]);
  if (!userResult.data?.syncfy_user_id || !integrationResult.data?.provider_connection_id) {
    return NextResponse.json({ success: false, error: 'La conexión segura con Syncfy ya no está disponible.' }, { status: 409 });
  }

  const session = await createSyncfySession(userResult.data.syncfy_user_id);
  const attachments = await listSyncfyAttachments(session.token, {
    idCredential: integrationResult.data.provider_connection_id,
    limit: 5_000,
  });
  const attachment = attachments.find((item) => String(item.id_attachment ?? item.id ?? '') === fiscalDocument.provider_document_id);
  if (!attachment?.url) return NextResponse.json({ success: false, error: 'Syncfy no entregó un archivo descargable para este documento.' }, { status: 409 });

  const providerUrl = new URL(attachment.url);
  if (providerUrl.protocol !== 'https:') return NextResponse.json({ success: false, error: 'Syncfy devolvió una ubicación de archivo no segura.' }, { status: 502 });
  const providerResponse = await fetch(providerUrl, {
    headers: { Authorization: `Bearer ${session.token}`, Accept: fiscalDocument.mime_type || '*/*' },
    redirect: 'follow',
  });
  if (!providerResponse.ok) return NextResponse.json({ success: false, error: `Syncfy no pudo descargar el documento (${providerResponse.status}).` }, { status: 502 });

  const declaredSize = Number(providerResponse.headers.get('content-length') || 0);
  if (declaredSize > 20 * 1024 * 1024) return NextResponse.json({ success: false, error: 'El documento excede el límite seguro de 20 MB.' }, { status: 413 });
  const bytes = await providerResponse.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024) return NextResponse.json({ success: false, error: 'El documento excede el límite seguro de 20 MB.' }, { status: 413 });

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': providerResponse.headers.get('content-type') || fiscalDocument.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${cleanFileName(fiscalDocument.file_name)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
