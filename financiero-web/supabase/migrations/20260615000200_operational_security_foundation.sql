-- Historial legado normalizado. Operational security foundation: audit trail and error events.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  request_method text,
  request_path text,
  ip_hash text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  action text,
  request_method text,
  request_path text,
  ip_hash text,
  user_agent text,
  message text NOT NULL,
  code text,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'critical')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS audit_events_profile_created_idx
  ON public.audit_events(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON public.audit_events(action, created_at DESC);

CREATE INDEX IF NOT EXISTS error_events_profile_created_idx
  ON public.error_events(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS error_events_severity_created_idx
  ON public.error_events(severity, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit events belong to profile" ON public.audit_events;
CREATE POLICY "Audit events belong to profile"
  ON public.audit_events
  FOR SELECT
  USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Error events belong to profile" ON public.error_events;
CREATE POLICY "Error events belong to profile"
  ON public.error_events
  FOR SELECT
  USING (profile_id = (SELECT auth.uid()));
