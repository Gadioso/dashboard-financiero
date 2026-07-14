-- Allow each SaaS profile to have its own monthly budget row.

DO $$
BEGIN
  IF to_regclass('public.presupuestos_mensuales') IS NOT NULL THEN
    ALTER TABLE public.presupuestos_mensuales
      DROP CONSTRAINT IF EXISTS presupuestos_mensuales_mes_anio_key;

    DROP INDEX IF EXISTS public.presupuestos_mensuales_mes_anio_key;
    DROP INDEX IF EXISTS public.presupuestos_profile_mes_unique_idx;

    CREATE UNIQUE INDEX presupuestos_profile_mes_unique_idx
      ON public.presupuestos_mensuales(
        coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
        mes_anio
      );
  END IF;
END $$;
