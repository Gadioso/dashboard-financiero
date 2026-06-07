-- Endurece las tablas financieras: el cliente anon no debe poder leer ni escribir datos.
-- Las rutas Next.js usan SUPABASE_SERVICE_ROLE_KEY desde servidor y siguen operando porque service_role bypasses RLS.

ALTER TABLE IF EXISTS gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS presupuestos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fondos_acumulados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telegram_memoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS santander_ingest_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS classification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS abonos_tarjeta_credito ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'gastos',
    'ingresos',
    'presupuestos_mensuales',
    'fondos_acumulados',
    'telegram_memoria',
    'santander_ingest_logs',
    'classification_preferences',
    'abonos_tarjeta_credito'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sequence_name TEXT;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'gastos_id_seq',
    'ingresos_id_seq',
    'presupuestos_mensuales_id_seq',
    'fondos_acumulados_id_seq'
  ]
  LOOP
    IF to_regclass('public.' || sequence_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', sequence_name);
    END IF;
  END LOOP;
END $$;

-- No se crean policies públicas intencionalmente.
-- Si más adelante agregamos login, se deben crear policies por user_id/profile_id.
