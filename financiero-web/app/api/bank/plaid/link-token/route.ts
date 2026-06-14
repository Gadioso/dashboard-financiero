import { NextResponse } from 'next/server';
import { createPlaidLinkToken } from '@/lib/open-banking/plaid';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const plaid = await createPlaidLinkToken({
      profileId: tenant.profileId,
      email: tenant.email,
    });

    return NextResponse.json({
      success: true,
      provider: 'plaid',
      linkToken: plaid.link_token,
      expiration: plaid.expiration,
      requestId: plaid.request_id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude crear el link_token de Plaid.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
