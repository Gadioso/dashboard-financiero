CREATE TABLE IF NOT EXISTS public.financial_goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.financial_goals(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  contributed_at date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'bank_transaction', 'investment_transaction', 'adjustment')),
  bank_transaction_id uuid REFERENCES public.bank_transactions_raw(id) ON DELETE SET NULL,
  investment_transaction_id uuid REFERENCES public.investment_transactions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  confidence numeric(5, 4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_goal_contribution_bank_uidx
  ON public.financial_goal_contributions(goal_id, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS financial_goal_contribution_investment_uidx
  ON public.financial_goal_contributions(goal_id, investment_transaction_id)
  WHERE investment_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS financial_goal_contributions_profile_goal_idx
  ON public.financial_goal_contributions(profile_id, goal_id, contributed_at DESC);

ALTER TABLE public.financial_goal_contributions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_goal_contributions TO authenticated, service_role;

DROP POLICY IF EXISTS "Goal contributions belong to authenticated profile" ON public.financial_goal_contributions;
CREATE POLICY "Goal contributions belong to authenticated profile"
  ON public.financial_goal_contributions FOR ALL TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

INSERT INTO public.financial_goal_contributions (profile_id, goal_id, amount, contributed_at, source, status, note, metadata)
SELECT profile_id, id, current_amount, current_date, 'adjustment', 'confirmed',
  'Saldo inicial migrado al historial de aportaciones', '{"migration":"20260724_goal_contribution_tracking"}'::jsonb
FROM public.financial_goals
WHERE current_amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.financial_goal_contributions contribution WHERE contribution.goal_id = financial_goals.id);

CREATE OR REPLACE FUNCTION public.sync_financial_goal_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_goal_id uuid := COALESCE(NEW.goal_id, OLD.goal_id);
BEGIN
  UPDATE public.financial_goals
  SET current_amount = COALESCE((
    SELECT SUM(amount)
    FROM public.financial_goal_contributions
    WHERE goal_id = target_goal_id AND status = 'confirmed'
  ), 0),
  updated_at = timezone('utc'::text, now())
  WHERE id = target_goal_id;
  IF TG_OP = 'UPDATE' AND OLD.goal_id IS DISTINCT FROM NEW.goal_id THEN
    UPDATE public.financial_goals
    SET current_amount = COALESCE((
      SELECT SUM(amount)
      FROM public.financial_goal_contributions
      WHERE goal_id = OLD.goal_id AND status = 'confirmed'
    ), 0),
    updated_at = timezone('utc'::text, now())
    WHERE id = OLD.goal_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_financial_goal_progress_trigger ON public.financial_goal_contributions;
CREATE TRIGGER sync_financial_goal_progress_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.financial_goal_contributions
FOR EACH ROW EXECUTE FUNCTION public.sync_financial_goal_progress();

COMMENT ON TABLE public.financial_goal_contributions IS
  'Auditable contributions assigned to a financial goal. Only confirmed rows change goal progress.';
