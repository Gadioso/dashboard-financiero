import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

const allowed = new Set(['es-MX', 'en-US']);

export async function PUT(request: Request) {
  const locale = String((await request.json().catch(() => ({})) as { locale?: string }).locale || '');
  if (!allowed.has(locale)) return NextResponse.json({ success: false, error: 'Unsupported locale.' }, { status: 400 });
  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase is not configured.' }, { status: 500 });
  const countryCode = locale === 'en-US' ? 'US' : 'MX';
  const { error } = await supabase.from('profiles').update({ locale, country_code: countryCode, updated_at: new Date().toISOString() }).eq('id', tenant.profileId);
  if (error) return NextResponse.json({ success: false, error: 'Could not save language preference.' }, { status: 500 });
  return NextResponse.json({ success: true, locale, countryCode });
}
