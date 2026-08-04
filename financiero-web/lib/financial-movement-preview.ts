import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFinancialImportRow } from '@/lib/financial-import';

export type PreviewMovement = {
  movementType: 'gasto' | 'ingreso' | 'abono_tarjeta';
  occurredAt: string;
  description: string;
  amount: number;
  category: 'Vida' | 'Placeres' | 'Futuro';
  subcategory: string;
  currency?: string;
};

export async function createFinancialMovementPreview({ supabase, profileId, channel, movements }: {
  supabase: SupabaseClient;
  profileId: string;
  channel: 'web' | 'telegram';
  movements: PreviewMovement[];
}) {
  const normalized = movements.slice(0, 120).map((movement, index) => {
    const row = buildFinancialImportRow({
      rowIndex: index + 1,
      movementType: movement.movementType === 'abono_tarjeta' ? 'gasto' : movement.movementType,
      occurredAt: movement.occurredAt,
      description: movement.description,
      amount: movement.amount,
      category: movement.category,
      subcategory: movement.subcategory,
      currency: movement.currency || 'MXN',
      sourceData: { channel },
    });
    if (row.status !== 'ready') return null;
    return { ...movement, currency: row.currency, fingerprint: row.fingerprint };
  }).filter((movement): movement is PreviewMovement & { fingerprint: string; currency: string } => Boolean(movement));
  if (!normalized.length) throw new Error('No encontré movimientos completos para confirmar.');
  const confirmationToken = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  const { data, error } = await supabase.from('financial_movement_previews').insert({
    profile_id: profileId,
    channel,
    confirmation_token: confirmationToken,
    movements: normalized,
  }).select('id, confirmation_token, movements').single();
  if (error) throw new Error(`No pude preparar los movimientos: ${error.message}`);
  return data as { id: string; confirmation_token: string; movements: typeof normalized };
}
