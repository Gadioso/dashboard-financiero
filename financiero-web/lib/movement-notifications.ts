import type { SupabaseClient } from '@supabase/supabase-js';

type MovementNotice = {
  profileId: string;
  type: 'ingreso' | 'gasto' | 'abono';
  concept: string;
  amount: number;
  category?: string | null;
  source: string;
  resourceId?: string | number | null;
  eventKey?: string | null;
};

export async function notifyDetectedMovement(supabase: SupabaseClient, notice: MovementNotice) {
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(notice.amount);
  const title = notice.type === 'ingreso'
    ? `Ingreso detectado: ${money}`
    : notice.type === 'abono'
      ? `Abono a tarjeta detectado: ${money}`
      : `Gasto detectado: ${money}`;
  const detail = [notice.concept, notice.category, notice.source].filter(Boolean).join(' · ');

  if (notice.eventKey) {
    const existing = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('profile_id', notice.profileId)
      .eq('agent_key', 'movement_monitor')
      .contains('metadata', { eventKey: notice.eventKey })
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) return { inboxCreated: false };
  }

  const inboxResult = await supabase.from('agent_tasks').insert({
    profile_id: notice.profileId,
    agent_key: 'movement_monitor',
    title,
    description: detail,
    status: 'open',
    priority: 'medium',
    source: 'system',
    metadata: {
      eventKey: notice.eventKey || null,
      source: notice.source,
      category: notice.category || null,
      resourceType: notice.type === 'ingreso' ? 'ingresos' : notice.type === 'abono' ? 'abonos_tarjeta_credito' : 'gastos',
      resourceId: notice.resourceId ? String(notice.resourceId) : null,
    },
  });
  if (inboxResult.error) throw new Error(`No pude crear la notificación: ${inboxResult.error.message}`);

  return { inboxCreated: true };
}
