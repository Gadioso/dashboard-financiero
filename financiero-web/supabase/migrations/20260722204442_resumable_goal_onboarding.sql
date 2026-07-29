ALTER TABLE public.financial_personalization_profiles
  ADD COLUMN IF NOT EXISTS interview_current_step integer NOT NULL DEFAULT 0
    CHECK (interview_current_step BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS interview_deferred_at timestamptz;

COMMENT ON COLUMN public.financial_personalization_profiles.interview_current_step
  IS 'Zero-based question index used to resume the optional financial-goals onboarding.';

COMMENT ON COLUMN public.financial_personalization_profiles.interview_deferred_at
  IS 'Last time the user explicitly saved the optional onboarding for later.';
