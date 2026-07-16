import { NextResponse } from 'next/server';
import { createSyncfySession, createSyncfyUser } from '@/lib/open-banking/syncfy';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type SyncfyUserRow = {
  id: string;
  syncfy_user_id: string;
  id_external: string;
  name: string;
};

function buildSyncfyExternalId(profileId: string) {
  return `dashboard-financiero:${profileId}`;
}

async function getOrCreateSyncfyUser({
  profileId,
  email,
}: {
  profileId: string;
  email?: string | null;
}) {
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    throw new Error('Falta configurar Supabase.');
  }

  const existing = await supabase
    .from('syncfy_users')
    .select('id, syncfy_user_id, id_external, name')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`No pude consultar el usuario Syncfy local: ${existing.error.message}`);
  }

  if (existing.data) {
    return existing.data as SyncfyUserRow;
  }

  const idExternal = buildSyncfyExternalId(profileId);
  const name = email ? `Virafi - ${email}` : 'Virafi User';
  const syncfyUser = await createSyncfyUser({ name, idExternal });

  const created = await supabase
    .from('syncfy_users')
    .insert({
      profile_id: profileId,
      syncfy_user_id: syncfyUser.id_user,
      id_external: syncfyUser.id_external || idExternal,
      name: syncfyUser.name || name,
      raw: syncfyUser,
    })
    .select('id, syncfy_user_id, id_external, name')
    .single();

  if (created.error) {
    throw new Error(`No pude guardar el usuario Syncfy local: ${created.error.message}`);
  }

  return created.data as SyncfyUserRow;
}

export async function POST(request: Request) {
  try {
    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const user = await getOrCreateSyncfyUser({
      profileId: tenant.profileId,
      email: tenant.email,
    });
    const session = await createSyncfySession(user.syncfy_user_id);

    return NextResponse.json({
      success: true,
      provider: 'syncfy',
      user: {
        id: user.id,
        syncfyUserId: user.syncfy_user_id,
        idExternal: user.id_external,
        name: user.name,
      },
      session: {
        token: session.token,
      },
      widget: {
        locale: 'es',
        country: 'MX',
        siteOrganizationType: '56cf4f5b784806cf028b4568',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude crear la sesion de Syncfy.';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
