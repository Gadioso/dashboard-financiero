import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

const categories = new Set(['Vida', 'Placeres', 'Futuro']);
const normalize = (value: unknown) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const { data, error } = await supabase.from('classification_preferences').select('id, matcher, categoria, subcategoria, updated_at').eq('profile_id', tenant.profileId).order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, preferences: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const matcher = normalize(body.matcher);
  const categoria = String(body.category || '');
  const subcategoria = String(body.subcategory || '').trim() || categoria;
  if (matcher.length < 2 || !categories.has(categoria)) return NextResponse.json({ success: false, error: 'Completa comercio, bolsa y subcategoría.' }, { status: 400 });
  const { data, error } = await supabase.from('classification_preferences').upsert({ profile_id: tenant.profileId, matcher, categoria, subcategoria, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,matcher' }).select('id, matcher, categoria, subcategoria, updated_at').single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, preference: data });
}
