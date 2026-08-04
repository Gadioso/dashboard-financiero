import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'La confirmación no está disponible.' }, { status: 500 });
  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.rpc('confirm_financial_movement_preview', { p_profile_id: tenant.profileId, p_preview_id: id });
  if (error) return NextResponse.json({ success: false, error: 'No pude confirmar esta previsualización.' }, { status: error.code === 'P0002' ? 404 : 409 });
  await sincronizarPresupuestoMensual(supabase, new Date(), tenant.profileId);
  return NextResponse.json({ success: true, ...(data as Record<string, unknown>) });
}
