import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClientIp } from '@/lib/rate-limit';

type EventSupabase = SupabaseClient;

type EventContext = {
  supabase: EventSupabase | null;
  request?: Request;
  profileId?: string | null;
  actorEmail?: string | null;
};

type AuditEventInput = EventContext & {
  action: string;
  resourceType?: string | null;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown>;
};

type ErrorEventInput = EventContext & {
  action?: string | null;
  error: unknown;
  code?: string | null;
  severity?: 'warning' | 'error' | 'critical';
  metadata?: Record<string, unknown>;
};

function safeJson(value?: Record<string, unknown>) {
  return value || {};
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return 'Error desconocido.';
    }
  }
  return String(error || 'Error desconocido.');
}

function requestPath(request?: Request) {
  if (!request) return null;

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function hashIp(request?: Request) {
  if (!request) return null;

  const ip = getClientIp(request);

  if (!ip) return null;

  const salt = process.env.AUDIT_IP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dashboard-financiero';

  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

function eventBase({ request, profileId, actorEmail }: EventContext) {
  return {
    profile_id: profileId || null,
    actor_email: actorEmail || null,
    request_method: request?.method || null,
    request_path: requestPath(request),
    ip_hash: hashIp(request),
    user_agent: request?.headers.get('user-agent')?.slice(0, 500) || null,
  };
}

function isMissingOperationalTable(error: { message?: string; code?: string } | null) {
  return error?.code === '42P01' || /schema cache|Could not find|does not exist/i.test(error?.message || '');
}

export async function logAuditEvent({
  supabase,
  request,
  profileId,
  actorEmail,
  action,
  resourceType,
  resourceId,
  metadata,
}: AuditEventInput) {
  if (!supabase) return;

  const { error } = await supabase.from('audit_events').insert({
    ...eventBase({ supabase, request, profileId, actorEmail }),
    action,
    resource_type: resourceType || null,
    resource_id: resourceId == null ? null : String(resourceId),
    metadata: safeJson(metadata),
  });

  if (error && !isMissingOperationalTable(error)) {
    console.warn('No pude escribir audit_events:', error.message);
  }
}

export async function logErrorEvent({
  supabase,
  request,
  profileId,
  actorEmail,
  action,
  error,
  code,
  severity = 'error',
  metadata,
}: ErrorEventInput) {
  if (!supabase) return;

  const message = errorMessage(error);
  const { error: insertError } = await supabase.from('error_events').insert({
    ...eventBase({ supabase, request, profileId, actorEmail }),
    action: action || null,
    message,
    code: code || null,
    severity,
    metadata: safeJson(metadata),
  });

  if (insertError && !isMissingOperationalTable(insertError)) {
    console.warn('No pude escribir error_events:', insertError.message);
  }
}

export async function errorResponse({
  supabase,
  request,
  profileId,
  actorEmail,
  action,
  error,
  status = 500,
  code,
  publicMessage,
  metadata,
}: ErrorEventInput & {
  status?: number;
  publicMessage?: string;
}) {
  await logErrorEvent({
    supabase,
    request,
    profileId,
    actorEmail,
    action,
    error,
    code,
    severity: status >= 500 ? 'error' : 'warning',
    metadata: {
      ...metadata,
      status,
    },
  });

  const message = publicMessage || (error instanceof Error ? error.message : 'Error desconocido.');

  return NextResponse.json({ success: false, error: message, code: code || undefined }, { status });
}
