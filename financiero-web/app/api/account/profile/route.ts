import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

const selectFields = 'id, email, full_name, avatar_path, bio, professional_headline, location, website_url, financial_why, monthly_income_target, updated_at';
const imageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function cleanText(value: FormDataEntryValue | null, limit: number) {
  return String(value || '').trim().slice(0, limit) || null;
}

function cleanWebsite(value: FormDataEntryValue | null) {
  const website = cleanText(value, 500);
  if (!website) return null;
  try {
    const url = new URL(website);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function getContext(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  return { supabase, tenant };
}

export async function GET(request: Request) {
  const { supabase, tenant } = await getContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

  const { data, error } = await supabase.from('profiles').select(selectFields).eq('id', tenant.profileId).maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: 'No pude cargar tu perfil.' }, { status: 500 });

  return NextResponse.json({
    success: true,
    profile: data,
    avatarUrl: data.avatar_path ? `/api/account/profile/avatar?v=${encodeURIComponent(data.updated_at || '')}` : null,
  });
}

export async function PUT(request: Request) {
  const { supabase, tenant } = await getContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

  try {
    const form = await request.formData();
    const currentResult = await supabase.from('profiles').select('avatar_path').eq('id', tenant.profileId).maybeSingle();
    if (currentResult.error) return NextResponse.json({ success: false, error: 'No pude preparar tu perfil.' }, { status: 500 });

    let avatarPath = currentResult.data?.avatar_path || null;
    const avatar = form.get('avatar');
    const removeAvatar = form.get('removeAvatar') === 'true';

    if (removeAvatar && avatarPath) {
      const { error } = await supabase.storage.from('profile-avatars').remove([avatarPath]);
      if (error) return NextResponse.json({ success: false, error: 'No pude eliminar tu foto.' }, { status: 500 });
      avatarPath = null;
    }

    if (avatar instanceof File && avatar.size > 0) {
      const extension = imageTypes.get(avatar.type);
      if (!extension) return NextResponse.json({ success: false, error: 'Usa una imagen JPG, PNG o WebP.' }, { status: 400 });
      if (avatar.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, error: 'La foto debe pesar menos de 5 MB.' }, { status: 400 });

      const nextPath = `${tenant.profileId}/avatar.${extension}`;
      const upload = await supabase.storage.from('profile-avatars').upload(nextPath, Buffer.from(await avatar.arrayBuffer()), {
        contentType: avatar.type,
        cacheControl: '3600',
        upsert: true,
      });
      if (upload.error) return NextResponse.json({ success: false, error: 'No pude guardar tu foto.' }, { status: 500 });
      if (avatarPath && avatarPath !== nextPath) await supabase.storage.from('profile-avatars').remove([avatarPath]);
      avatarPath = nextPath;
    }

    const websiteInput = cleanText(form.get('website_url'), 500);
    const websiteUrl = cleanWebsite(form.get('website_url'));
    if (websiteInput && !websiteUrl) return NextResponse.json({ success: false, error: 'Escribe un sitio válido que comience con http:// o https://.' }, { status: 400 });

    const payload = {
      full_name: cleanText(form.get('full_name'), 160),
      professional_headline: cleanText(form.get('professional_headline'), 160),
      location: cleanText(form.get('location'), 160),
      website_url: websiteUrl,
      bio: cleanText(form.get('bio'), 1200),
      financial_why: cleanText(form.get('financial_why'), 600),
      avatar_path: avatarPath,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('profiles').update(payload).eq('id', tenant.profileId).select(selectFields).single();
    if (error) return NextResponse.json({ success: false, error: 'No pude guardar tu perfil.' }, { status: 500 });

    return NextResponse.json({
      success: true,
      profile: data,
      avatarUrl: data.avatar_path ? `/api/account/profile/avatar?v=${encodeURIComponent(data.updated_at || '')}` : null,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'No pude guardar tu perfil. Intenta nuevamente.' }, { status: 500 });
  }
}
