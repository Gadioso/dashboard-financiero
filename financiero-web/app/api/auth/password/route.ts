import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export async function POST(request: Request) {
  const tenant = await getRequestTenantContext(request);
  const supabase = getSupabaseServiceClient();
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };

  if (!tenant.profileId || tenant.source !== 'supabase-auth' || !supabase) {
    return NextResponse.json({ success: false, error: 'La sesión de recuperación no es válida.' }, { status: 401 });
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  const { error } = await supabase.auth.admin.updateUserById(tenant.profileId, { password });

  if (error) {
    return NextResponse.json({ success: false, error: 'No pudimos actualizar la contraseña.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
