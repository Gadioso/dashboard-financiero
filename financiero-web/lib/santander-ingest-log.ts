import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClasificacionMovimiento } from '@/lib/financial-core';
import { applyProfileFilter, withProfile } from '@/lib/tenant-context';

export type SantanderIngestLogStatus = 'inserted' | 'duplicate' | 'ignored' | 'error';

type SantanderIngestLogInput = {
  supabase: SupabaseClient;
  gmailMessageId?: string | null;
  from?: string | null;
  subject?: string | null;
  gmailReceivedAt?: string | null;
  appsScriptDetectedAt?: string | null;
  backendReceivedAt?: string | null;
  telegramSentAt?: string | null;
  profileId?: string | null;
  status: SantanderIngestLogStatus;
  reason?: string | null;
  parsed?: ClasificacionMovimiento | null;
  gastoId?: string | number | null;
  ingresoId?: string | number | null;
  abonoTarjetaId?: string | number | null;
  telegramNotified?: boolean;
  error?: string | null;
};

function safeDate(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function diffMs(from?: string | null, to?: string | null) {
  const start = from ? new Date(from).getTime() : Number.NaN;
  const end = to ? new Date(to).getTime() : Number.NaN;

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;

  return end - start;
}

export async function registrarSantanderIngestLog({
  supabase,
  gmailMessageId,
  from,
  subject,
  gmailReceivedAt,
  appsScriptDetectedAt,
  backendReceivedAt,
  telegramSentAt,
  profileId,
  status,
  reason,
  parsed,
  gastoId,
  ingresoId,
  abonoTarjetaId,
  telegramNotified,
  error,
}: SantanderIngestLogInput) {
  const backendAt = safeDate(backendReceivedAt) || new Date().toISOString();
  const gmailAt = safeDate(gmailReceivedAt);
  const appsScriptAt = safeDate(appsScriptDetectedAt);
  const telegramAt = safeDate(telegramSentAt);
  const basePayload = withProfile({
    gmail_message_id: gmailMessageId || null,
    from_email: from || null,
    subject: subject || null,
    status,
    reason: reason || null,
    movimiento_tipo: parsed?.tipo || null,
    gasto_id: gastoId ? String(gastoId) : null,
    ingreso_id: ingresoId ? String(ingresoId) : null,
    abono_tarjeta_id: abonoTarjetaId ? String(abonoTarjetaId) : null,
    concepto: parsed?.concepto || null,
    monto: parsed?.monto ?? null,
    categoria: parsed?.categoria || null,
    subcategoria: parsed?.subcategoria || null,
    telegram_notified: telegramNotified ?? false,
    error: error || null,
  }, profileId);
  const payload = {
    ...basePayload,
    gmail_received_at: gmailAt,
    apps_script_detected_at: appsScriptAt,
    backend_received_at: backendAt,
    telegram_sent_at: telegramAt,
    ingest_latency_ms: diffMs(appsScriptAt || gmailAt, backendAt),
    telegram_latency_ms: telegramAt ? diffMs(backendAt, telegramAt) : null,
  };

  const { error: insertError } = await supabase.from('santander_ingest_logs').insert([payload]);

  if (insertError) {
    if (/column .* does not exist|schema cache|Could not find/i.test(insertError.message)) {
      const { error: retryError } = await supabase.from('santander_ingest_logs').insert([basePayload]);

      if (retryError) {
        console.warn('No pude escribir santander_ingest_logs:', retryError.message);
      }

      return;
    }

    console.warn('No pude escribir santander_ingest_logs:', insertError.message);
  }
}

export async function obtenerSantanderIngestLogs(supabase: SupabaseClient) {
  return obtenerSantanderIngestLogsPorPerfil(supabase, null);
}

type SantanderIngestLogRow = {
  id: string;
  status?: SantanderIngestLogStatus | null;
  concepto?: string | null;
  reason?: string | null;
  gasto_id?: string | null;
  ingreso_id?: string | null;
  abono_tarjeta_id?: string | null;
};

function pareceCorreoPromocionalOGuardadoRoto(log: SantanderIngestLogRow) {
  const texto = `${log.concepto || ''} ${log.reason || ''}`;

  return /(&[a-z]+;|tu\s+navegador|si\s+est(?:ás|&aacute;s)\s+pensando|junio\s+20\d{2}|haz\s+compras|compras\s+mayores|difiere|msi|terminales?\s+clip)/i.test(texto);
}

async function rowExists({
  supabase,
  table,
  id,
  profileId,
}: {
  supabase: SupabaseClient;
  table: 'gastos' | 'ingresos' | 'abonos_tarjeta_credito';
  id?: string | null;
  profileId?: string | null;
}) {
  if (!id) return false;

  const query = supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .limit(1);
  const { data, error } = await applyProfileFilter(query, profileId).maybeSingle();

  if (error) return false;

  return Boolean(data?.id);
}

async function filtrarLogsVisibles({
  supabase,
  logs,
  profileId,
  limit,
}: {
  supabase: SupabaseClient;
  logs: SantanderIngestLogRow[];
  profileId?: string | null;
  limit: number;
}) {
  const visibles = [];

  for (const log of logs) {
    if (log.status !== 'inserted') continue;
    if (pareceCorreoPromocionalOGuardadoRoto(log)) continue;

    const exists = await rowExists({ supabase, table: 'gastos', id: log.gasto_id, profileId }) ||
      await rowExists({ supabase, table: 'ingresos', id: log.ingreso_id, profileId }) ||
      await rowExists({ supabase, table: 'abonos_tarjeta_credito', id: log.abono_tarjeta_id, profileId });

    if (exists) visibles.push(log);
    if (visibles.length >= limit) break;
  }

  return visibles;
}

export async function obtenerSantanderIngestLogsPorPerfil(supabase: SupabaseClient, profileId?: string | null) {
  const selectBase = 'id, created_at, gmail_message_id, subject, status, reason, movimiento_tipo, gasto_id, ingreso_id, abono_tarjeta_id, concepto, monto, categoria, subcategoria, telegram_notified, error';
  const selectWithLatency = `${selectBase}, gmail_received_at, apps_script_detected_at, backend_received_at, telegram_sent_at, ingest_latency_ms, telegram_latency_ms`;
  const visibleLimit = 6;
  const query = supabase
    .from('santander_ingest_logs')
    .select(selectWithLatency)
    .order('created_at', { ascending: false })
    .limit(40);
  const { data, error } = await applyProfileFilter(query, profileId);

  if (error) {
    if (/column .* does not exist|schema cache|Could not find/i.test(error.message)) {
      const fallbackQuery = supabase
        .from('santander_ingest_logs')
        .select(selectBase)
        .order('created_at', { ascending: false })
        .limit(40);
      const fallback = await applyProfileFilter(fallbackQuery, profileId);

      if (!fallback.error) {
        return {
          available: true,
          logs: await filtrarLogsVisibles({
            supabase,
            logs: fallback.data || [],
            profileId,
            limit: visibleLimit,
          }),
          error: 'Ejecuta la migración de latencia para ver tiempos Gmail/App Script/Telegram.',
        };
      }
    }

    return {
      available: false,
      logs: [],
      error: error.message,
    };
  }

  return {
    available: true,
    logs: await filtrarLogsVisibles({
      supabase,
      logs: data || [],
      profileId,
      limit: visibleLimit,
    }),
    error: null,
  };
}
