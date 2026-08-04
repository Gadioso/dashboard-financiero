import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const tenant = await getRequestTenantContext(request);
  if (!supabase || !tenant.profileId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const profile = await supabase.from('profiles').select('avatar_path').eq('id', tenant.profileId).maybeSingle();
  if (profile.error || !profile.data?.avatar_path) return NextResponse.json({ error: 'Foto no encontrada.' }, { status: 404 });
  if (!profile.data.avatar_path.startsWith(`${tenant.profileId}/`)) {
    return NextResponse.json({ error: 'Foto no encontrada.' }, { status: 404 });
  }

  const download = await supabase.storage.from('profile-avatars').download(profile.data.avatar_path);
  if (download.error || !download.data) return NextResponse.json({ error: 'Foto no encontrada.' }, { status: 404 });

  return new Response(await download.data.arrayBuffer(), {
    headers: {
      'Content-Type': download.data.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
