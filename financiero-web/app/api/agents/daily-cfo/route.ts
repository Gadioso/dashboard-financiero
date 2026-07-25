import { NextResponse } from 'next/server';
import { runDailyCfoScheduler } from '@/lib/daily-cfo';
import { logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ProfileRow = {
  id: string;
  full_name?: string | null;
  monthly_income_target?: number | string | null;
};

function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET || '';
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, monthly_income_target')
      .order('id');
    if (error) throw new Error(`No pude leer los perfiles: ${error.message}`);

    const run = await runDailyCfoScheduler({ supabase, profiles: (data || []) as ProfileRow[] });
    return NextResponse.json({ success: true, processed: run.results.length, ...run });
  } catch (error: unknown) {
    await logErrorEvent({ supabase, request, action: 'agents.daily_cfo.cron', error });
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido.',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });

  try {
    const tenant = await getRequestTenantContext(request);
    if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, monthly_income_target')
      .eq('id', tenant.profileId)
      .single();
    if (error) throw new Error(`No pude leer el perfil: ${error.message}`);

    const run = await runDailyCfoScheduler({ supabase, profiles: [data as ProfileRow], force: true });
    return NextResponse.json({ success: true, processed: run.results.length, ...run });
  } catch (error: unknown) {
    await logErrorEvent({ supabase, request, action: 'agents.daily_cfo.manual', error });
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido.',
    }, { status: 500 });
  }
}
