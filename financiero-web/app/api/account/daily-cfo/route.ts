import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const preferenceSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().min(1).max(100).optional(),
  inAppEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  tone: z.enum(['natural', 'relaxed', 'direct', 'formal']).optional(),
});

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });

  const { data, error } = await supabase.from('daily_cfo_preferences').select('*').eq('profile_id', tenant.profileId).maybeSingle();
  if (error && !/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({
    success: true,
    preference: data || {
      profile_id: tenant.profileId,
      enabled: true,
      timezone: 'America/Mexico_City',
      delivery_window_start: 8,
      delivery_window_end: 14,
      in_app_enabled: true,
      telegram_enabled: true,
      tone: 'natural',
    },
  });
}

export async function PUT(request: Request) {
  const tenant = await getRequestTenantContext(request);
  if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });

  const parsed = preferenceSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Preferencias inválidas.' }, { status: 400 });
  if (parsed.data.timezone && !validTimezone(parsed.data.timezone)) {
    return NextResponse.json({ success: false, error: 'Zona horaria inválida.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('daily_cfo_preferences').upsert({
    profile_id: tenant.profileId,
    delivery_window_start: 8,
    delivery_window_end: 14,
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
    ...(parsed.data.inAppEnabled !== undefined ? { in_app_enabled: parsed.data.inAppEnabled } : {}),
    ...(parsed.data.telegramEnabled !== undefined ? { telegram_enabled: parsed.data.telegramEnabled } : {}),
    ...(parsed.data.tone ? { tone: parsed.data.tone } : {}),
    updated_at: now,
  }, { onConflict: 'profile_id' }).select('*').single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, preference: data });
}
