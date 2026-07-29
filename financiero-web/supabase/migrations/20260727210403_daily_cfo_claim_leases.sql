-- Atomic, recoverable claims for the daily CFO. The existing unique
-- (profile_id, local_date) constraint remains the logical idempotency key.

ALTER TABLE public.daily_cfo_briefings
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 1 CHECK (workflow_version > 0),
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.daily_cfo_briefings
SET idempotency_key = 'daily-cfo:v1:' || profile_id::text || ':' || local_date::text
WHERE idempotency_key IS NULL;

ALTER TABLE public.daily_cfo_briefings
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS daily_cfo_briefings_idempotency_uidx
  ON public.daily_cfo_briefings(idempotency_key);

CREATE OR REPLACE FUNCTION public.claim_daily_cfo_briefing(
  p_profile_id uuid,
  p_local_date date,
  p_timezone text,
  p_scheduled_for timestamptz,
  p_workflow_version integer DEFAULT 1
)
RETURNS TABLE(briefing_id uuid, outcome text, lease_token uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing public.daily_cfo_briefings%ROWTYPE;
  next_token uuid := gen_random_uuid();
  next_key text := 'daily-cfo:v' || p_workflow_version::text || ':' || p_profile_id::text || ':' || p_local_date::text;
BEGIN
  INSERT INTO public.daily_cfo_briefings (
    profile_id,
    local_date,
    timezone,
    scheduled_for,
    status,
    claim_token,
    lease_expires_at,
    attempts,
    workflow_version,
    idempotency_key
  ) VALUES (
    p_profile_id,
    p_local_date,
    p_timezone,
    p_scheduled_for,
    'processing',
    next_token,
    now() + interval '15 minutes',
    1,
    p_workflow_version,
    next_key
  )
  ON CONFLICT (profile_id, local_date) DO NOTHING
  RETURNING id INTO briefing_id;

  IF briefing_id IS NOT NULL THEN
    outcome := 'claimed';
    lease_token := next_token;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO existing
  FROM public.daily_cfo_briefings
  WHERE profile_id = p_profile_id AND local_date = p_local_date
  FOR UPDATE;

  IF existing.status IN ('ready', 'sent', 'partial') THEN
    briefing_id := existing.id;
    outcome := 'already-completed';
    lease_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF existing.status = 'processing' AND existing.lease_expires_at > now() THEN
    briefing_id := existing.id;
    outcome := 'in-progress';
    lease_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.daily_cfo_briefings
  SET status = 'processing',
      claim_token = next_token,
      lease_expires_at = now() + interval '15 minutes',
      attempts = attempts + 1,
      workflow_version = p_workflow_version,
      idempotency_key = next_key,
      scheduled_for = p_scheduled_for,
      timezone = p_timezone,
      error_message = NULL,
      updated_at = now()
  WHERE id = existing.id;

  briefing_id := existing.id;
  outcome := 'claimed';
  lease_token := next_token;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_cfo_briefing(uuid, date, text, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_cfo_briefing(uuid, date, text, timestamptz, integer)
  TO service_role;

COMMENT ON FUNCTION public.claim_daily_cfo_briefing(uuid, date, text, timestamptz, integer) IS
  'Claims one daily CFO briefing atomically and recovers failed or expired processing leases.';
