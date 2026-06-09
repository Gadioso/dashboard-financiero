-- Base multiusuario para convertir el dashboard privado en SaaS.
-- Ejecutar solo cuando se active Supabase Auth o un proveedor de auth compatible con auth.uid().
-- Las filas históricas actuales quedan con profile_id NULL hasta que se asignen al usuario dueño.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  monthly_income_target NUMERIC(12, 2) DEFAULT 60000.00,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS telegram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  last_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS gmail_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked', 'error')),
  history_id TEXT,
  watch_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  UNIQUE(profile_id, email)
);

ALTER TABLE IF EXISTS gastos ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS ingresos ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS presupuestos_mensuales ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS fondos_acumulados ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS telegram_memoria ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS santander_ingest_logs ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS classification_preferences ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS abonos_tarjeta_credito ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS telegram_accounts_profile_idx ON telegram_accounts(profile_id);
CREATE INDEX IF NOT EXISTS gmail_integrations_profile_idx ON gmail_integrations(profile_id);

DO $$
BEGIN
  IF to_regclass('public.gastos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS gastos_profile_fecha_idx ON gastos(profile_id, fecha DESC);
  END IF;

  IF to_regclass('public.ingresos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS ingresos_profile_fecha_idx ON ingresos(profile_id, fecha DESC);
  END IF;

  IF to_regclass('public.presupuestos_mensuales') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS presupuestos_profile_mes_idx ON presupuestos_mensuales(profile_id, mes_anio);
  END IF;

  IF to_regclass('public.fondos_acumulados') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS fondos_profile_cuenta_idx ON fondos_acumulados(profile_id, cuenta);
  END IF;

  IF to_regclass('public.telegram_memoria') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS telegram_memoria_profile_idx ON telegram_memoria(profile_id);
  END IF;

  IF to_regclass('public.santander_ingest_logs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS santander_ingest_logs_profile_created_idx ON santander_ingest_logs(profile_id, created_at DESC);
  END IF;

  IF to_regclass('public.classification_preferences') IS NOT NULL THEN
    ALTER TABLE classification_preferences
      DROP CONSTRAINT IF EXISTS classification_preferences_matcher_key;
    CREATE INDEX IF NOT EXISTS classification_preferences_profile_matcher_idx
      ON classification_preferences(profile_id, matcher);
    CREATE UNIQUE INDEX IF NOT EXISTS classification_preferences_profile_matcher_unique_idx
      ON classification_preferences(profile_id, matcher);
  END IF;

  IF to_regclass('public.abonos_tarjeta_credito') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS abonos_tarjeta_profile_fecha_idx ON abonos_tarjeta_credito(profile_id, fecha DESC);
  END IF;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are self readable" ON profiles;
CREATE POLICY "Profiles are self readable"
  ON profiles FOR SELECT
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Profiles are self insertable" ON profiles;
CREATE POLICY "Profiles are self insertable"
  ON profiles FOR INSERT
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Profiles are self writable" ON profiles;
CREATE POLICY "Profiles are self writable"
  ON profiles FOR UPDATE
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Telegram accounts belong to profile" ON telegram_accounts;
CREATE POLICY "Telegram accounts belong to profile"
  ON telegram_accounts FOR ALL
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));

DROP POLICY IF EXISTS "Gmail integrations belong to profile" ON gmail_integrations;
CREATE POLICY "Gmail integrations belong to profile"
  ON gmail_integrations FOR ALL
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));

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
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS "Rows belong to authenticated profile" ON public.%I', table_name);
      EXECUTE format(
        'CREATE POLICY "Rows belong to authenticated profile" ON public.%I FOR ALL USING (profile_id = (select auth.uid())) WITH CHECK (profile_id = (select auth.uid()))',
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- Para asignar tus filas históricas actuales al usuario Diego cuando ya exista en auth.users:
-- UPDATE gastos SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE ingresos SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE presupuestos_mensuales SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE fondos_acumulados SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE telegram_memoria SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE santander_ingest_logs SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE classification_preferences SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
-- UPDATE abonos_tarjeta_credito SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
