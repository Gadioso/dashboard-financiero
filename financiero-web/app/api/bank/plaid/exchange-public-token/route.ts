import { NextResponse } from 'next/server';
import { assertBillingLimit, BillingLimitError } from '@/lib/billing';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { encryptBankSecret } from '@/lib/open-banking/bank-secret-box';
import { exchangePlaidPublicToken } from '@/lib/open-banking/plaid';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type PlaidExchangeBody = {
  publicToken?: string;
  institution?: {
    institution_id?: string;
    name?: string;
  };
};

function hasText(value?: string | null) {
  return Boolean(value?.trim());
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

    const body = (await request.json()) as PlaidExchangeBody;
    const publicToken = body.publicToken?.trim();

    if (!publicToken) {
      return NextResponse.json({ success: false, error: 'Falta publicToken.' }, { status: 400 });
    }

    const plaid = await exchangePlaidPublicToken(publicToken);
    const payload = {
      profile_id: tenant.profileId,
      provider: 'plaid',
      provider_item_id: plaid.item_id,
      institution_id: body.institution?.institution_id || null,
      institution_name: body.institution?.name || null,
      status: 'active',
      access_token_encrypted: encryptBankSecret(plaid.access_token),
      last_sync_at: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    };

    const existingByItem = await supabase
      .from('bank_connections')
      .select('id')
      .eq('profile_id', tenant.profileId)
      .eq('provider_item_id', plaid.item_id)
      .maybeSingle();

    if (existingByItem.error) {
      throw new Error(existingByItem.error.message);
    }

    const existingByInstitution = !existingByItem.data?.id && hasText(body.institution?.institution_id)
      ? await supabase
          .from('bank_connections')
          .select('id')
          .eq('profile_id', tenant.profileId)
          .eq('provider', 'plaid')
          .eq('institution_id', body.institution?.institution_id || '')
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

    if (existingByInstitution.error) {
      throw new Error(existingByInstitution.error.message);
    }

    const existingId = existingByItem.data?.id || existingByInstitution.data?.id;

    if (!existingId) {
      const { count, error: countError } = await supabase
        .from('bank_connections')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', tenant.profileId)
        .eq('status', 'active');

      if (countError) throw new Error(countError.message);

      await assertBillingLimit({
        supabase,
        profileId: tenant.profileId,
        resource: 'bankConnections',
        currentCount: count || 0,
      });
    }

    const result = existingId
      ? await supabase
          .from('bank_connections')
          .update(payload)
          .eq('id', existingId)
          .eq('profile_id', tenant.profileId)
          .select('id, provider, provider_item_id, institution_name, status')
          .single()
      : await supabase
          .from('bank_connections')
          .insert(payload)
          .select('id, provider, provider_item_id, institution_name, status')
          .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: existingId ? 'bank.connection.updated' : 'bank.connection.created',
      resourceType: 'bank_connections',
      resourceId: result.data.id,
      metadata: {
        provider: 'plaid',
        institutionName: body.institution?.name || null,
      },
    });

    return NextResponse.json({
      success: true,
      provider: 'plaid',
      connection: result.data,
      requestId: plaid.request_id,
    });
  } catch (error: unknown) {
    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'bank.connection.exchange_token',
      error,
      severity: error instanceof BillingLimitError ? 'warning' : 'error',
    });
    const message = error instanceof Error ? error.message : 'No pude guardar la conexion Plaid.';
    const status = error instanceof BillingLimitError ? error.status : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
