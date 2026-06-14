import { NextResponse } from 'next/server';
import { getOpenBankingProviders } from '@/lib/open-banking/providers';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const tenant = await getRequestTenantContext(request);

  if (!tenant.profileId) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    profileScoped: true,
    providers: getOpenBankingProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      regions: provider.regions,
      configured: provider.configured,
      status: provider.status,
      missingEnvVars: provider.missingEnvVars,
      priority: provider.priority,
      notes: provider.notes,
    })),
  });
}
