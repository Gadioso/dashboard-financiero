import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClasificacionMovimiento } from '@/lib/financial-core';

export type SantanderIngestLogStatus = 'inserted' | 'duplicate' | 'ignored' | 'error';

type SantanderIngestLogInput = {
  supabase: SupabaseClient;
  gmailMessageId?: string | null;
  from?: string | null;
  subject?: string | null;
  status: SantanderIngestLogStatus;
  reason?: string | null;
  parsed?: ClasificacionMovimiento | null;
  gastoId?: string | number | null;
  ingresoId?: string | number | null;
  telegramNotified?: boolean;
  error?: string | null;
};

export async function registrarSantanderIngestLog({
  supabase,
  gmailMessageId,
  from,
  subject,
  status,
  reason,
  parsed,
  gastoId,
  ingresoId,
  telegramNotified,
  error,
}: SantanderIngestLogInput) {
  const payload = {
    gmail_message_id: gmailMessageId || null,
    from_email: from || null,
    subject: subject || null,
    status,
    reason: reason || null,
    movimiento_tipo: parsed?.tipo || null,
    gasto_id: gastoId ? String(gastoId) : null,
    ingreso_id: ingresoId ? String(ingresoId) : null,
    concepto: parsed?.concepto || null,
    monto: parsed?.monto ?? null,
    categoria: parsed?.categoria || null,
    subcategoria: parsed?.subcategoria || null,
    telegram_notified: telegramNotified ?? false,
    error: error || null,
  };

  const { error: insertError } = await supabase.from('santander_ingest_logs').insert([payload]);

  if (insertError) {
    console.warn('No pude escribir santander_ingest_logs:', insertError.message);
  }
}

export async function obtenerSantanderIngestLogs(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('santander_ingest_logs')
    .select('id, created_at, gmail_message_id, subject, status, reason, movimiento_tipo, gasto_id, ingreso_id, concepto, monto, categoria, subcategoria, telegram_notified, error')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    return {
      available: false,
      logs: [],
      error: error.message,
    };
  }

  return {
    available: true,
    logs: data || [],
    error: null,
  };
}
