-- Historial remoto reconciliado.
CREATE TABLE IF NOT EXISTS public.financial_personalization_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  birth_year integer CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100),
  occupation text,
  industry text,
  work_model text,
  income_sources text[] NOT NULL DEFAULT '{}',
  income_growth_goal text,
  short_term_goals text[] NOT NULL DEFAULT '{}',
  medium_term_goals text[] NOT NULL DEFAULT '{}',
  long_term_goals text[] NOT NULL DEFAULT '{}',
  financial_concerns text[] NOT NULL DEFAULT '{}',
  valued_pleasures text[] NOT NULL DEFAULT '{}',
  pleasures_to_reduce text[] NOT NULL DEFAULT '{}',
  recurring_life_costs text[] NOT NULL DEFAULT '{}',
  recurring_investments text[] NOT NULL DEFAULT '{}',
  emergency_fund_status text,
  investment_experience text,
  risk_tolerance text,
  recommendation_style text,
  interview_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.financial_personalization_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_personalization_profiles TO authenticated;
DROP POLICY IF EXISTS "Personalization belongs to profile" ON public.financial_personalization_profiles;
CREATE POLICY "Personalization belongs to profile"
  ON public.financial_personalization_profiles FOR ALL
  TO authenticated
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));
