import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth-session';
import { logAuditEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);

  await logAuditEvent({
    supabase,
    request,
    profileId: tenant.profileId,
    actorEmail: tenant.email,
    action: 'auth.logout',
    resourceType: 'profile',
    resourceId: tenant.profileId,
  });

  return response;
}
