-- Daily VirafIA CFO mentor: per-user schedule, goal pacing, durable delivery,
-- and one shared conversation history across the app and Telegram.

CREATE TABLE IF NOT EXISTS public.daily_cfo_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  delivery_window_start smallint NOT NULL DEFAULT 8 CHECK (delivery_window_start BETWEEN 0 AND 23),
  delivery_window_end smallint NOT NULL DEFAULT 14 CHECK (delivery_window_end BETWEEN 1 AND 24),
  in_app_enabled boolean NOT NULL DEFAULT true,
  telegram_enabled boolean NOT NULL DEFAULT true,
  tone text NOT NULL DEFAULT 'natural' CHECK (tone IN ('natural', 'relaxed', 'direct', 'formal')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (delivery_window_end > delivery_window_start)
);

CREATE TABLE IF NOT EXISTS public.daily_cfo_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  timezone text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'sent', 'partial', 'failed')),
  message text,
  summary text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  goal_paces jsonb NOT NULL DEFAULT '[]'::jsonb,
  financial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  generated_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (profile_id, local_date)
);

CREATE INDEX IF NOT EXISTS daily_cfo_briefings_profile_date_idx
  ON public.daily_cfo_briefings(profile_id, local_date DESC);

CREATE INDEX IF NOT EXISTS daily_cfo_briefings_status_schedule_idx
  ON public.daily_cfo_briefings(status, scheduled_for);

CREATE TABLE IF NOT EXISTS public.daily_cfo_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid NOT NULL REFERENCES public.daily_cfo_briefings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'telegram')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (briefing_id, channel)
);

CREATE INDEX IF NOT EXISTS daily_cfo_deliveries_retry_idx
  ON public.daily_cfo_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS public.virafia_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'telegram', 'proactive', 'system')),
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 8000),
  daily_briefing_id uuid REFERENCES public.daily_cfo_briefings(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS virafia_conversation_profile_time_idx
  ON public.virafia_conversation_messages(profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS virafia_conversation_daily_briefing_uidx
  ON public.virafia_conversation_messages(daily_briefing_id)
  WHERE daily_briefing_id IS NOT NULL AND role = 'assistant';

ALTER TABLE public.daily_cfo_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_cfo_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_cfo_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virafia_conversation_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_cfo_preferences TO authenticated, service_role;
GRANT SELECT ON public.daily_cfo_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_cfo_briefings TO service_role;
GRANT SELECT ON public.daily_cfo_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_cfo_deliveries TO service_role;
GRANT SELECT, INSERT ON public.virafia_conversation_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.virafia_conversation_messages TO service_role;

DROP POLICY IF EXISTS "Daily CFO preferences belong to profile" ON public.daily_cfo_preferences;
CREATE POLICY "Daily CFO preferences belong to profile"
  ON public.daily_cfo_preferences FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = profile_id)
  WITH CHECK ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS "Daily CFO briefings belong to profile" ON public.daily_cfo_briefings;
CREATE POLICY "Daily CFO briefings belong to profile"
  ON public.daily_cfo_briefings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS "Daily CFO deliveries belong to profile" ON public.daily_cfo_deliveries;
CREATE POLICY "Daily CFO deliveries belong to profile"
  ON public.daily_cfo_deliveries FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS "VirafIA messages belong to profile" ON public.virafia_conversation_messages;
CREATE POLICY "VirafIA messages belong to profile"
  ON public.virafia_conversation_messages FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = profile_id);

DROP POLICY IF EXISTS "Users can add their VirafIA messages" ON public.virafia_conversation_messages;
CREATE POLICY "Users can add their VirafIA messages"
  ON public.virafia_conversation_messages FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = profile_id AND role = 'user' AND channel = 'in_app');

COMMENT ON TABLE public.daily_cfo_briefings IS
  'One idempotent VirafIA mentor analysis per profile and local calendar day.';
COMMENT ON TABLE public.daily_cfo_deliveries IS
  'Durable per-channel delivery ledger for retries and duplicate prevention.';
COMMENT ON TABLE public.virafia_conversation_messages IS
  'Shared VirafIA conversation history used by the web app, proactive mentor and Telegram.';
