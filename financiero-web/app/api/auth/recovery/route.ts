import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSupabaseAnonClient } from '@/lib/supabase-server';

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit({
    key: `auth-recovery:${getClientIp(request)}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json({ success: false, error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }

  const { email: rawEmail } = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(rawEmail);
  const supabase = getSupabaseAnonClient();

  if (!email || !supabase) {
    return NextResponse.json({ success: true, message: 'Si la cuenta existe, recibirás instrucciones para recuperar el acceso.' });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent('/auth/update-password')}`,
  });

  return NextResponse.json({
    success: true,
    message: 'Si la cuenta existe, recibirás instrucciones para recuperar el acceso desde Virafi.',
  });
}
