import { NextResponse } from 'next/server';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  const { id } = await context.params;

  try {
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bank_connections')
      .update({
        status: 'revoked',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('profile_id', tenant.profileId)
      .select('id, provider, institution_name, status')
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'No encontré esa conexión bancaria.' }, { status: 404 });
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank.connection.revoked',
      resourceType: 'bank_connections',
      resourceId: data.id,
      metadata: {
        provider: data.provider,
        institutionName: data.institution_name || null,
      },
    });

    return NextResponse.json({
      success: true,
      connection: data,
    });
  } catch (error: unknown) {
    await logErrorEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'bank.connection.revoke',
      error,
      severity: 'error',
    });
    const message = error instanceof Error ? error.message : 'No pude eliminar la conexión bancaria.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
