ALTER TABLE public.financial_personalization_profiles
  ADD COLUMN IF NOT EXISTS work_essential_costs text[] NOT NULL DEFAULT '{}';
