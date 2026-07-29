-- Historial remoto reconciliado.
ALTER TABLE public.financial_personalization_profiles
  ADD COLUMN IF NOT EXISTS goal_priorities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monthly_goal_capacity numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_goal_capacity >= 0);
