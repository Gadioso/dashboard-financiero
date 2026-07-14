CREATE TABLE IF NOT EXISTS public.financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 500),
  current_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  target_date date,
  horizon_months integer NOT NULL DEFAULT 12 CHECK (horizon_months BETWEEN 1 AND 600),
  source text NOT NULL DEFAULT 'personalization' CHECK (source IN ('personalization', 'manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (profile_id, name)
);

CREATE INDEX IF NOT EXISTS financial_goals_profile_status_idx
  ON public.financial_goals(profile_id, status, sort_order, created_at);

ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_goals TO authenticated, service_role;

DROP POLICY IF EXISTS "Financial goals belong to authenticated profile" ON public.financial_goals;
CREATE POLICY "Financial goals belong to authenticated profile"
  ON public.financial_goals
  FOR ALL
  TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));
