const financialTables = [
  'gastos',
  'ingresos',
  'presupuestos_mensuales',
  'fondos_acumulados',
  'telegram_memoria',
  'santander_ingest_logs',
  'classification_preferences',
  'abonos_tarjeta_credito',
];

const tableListSql = financialTables.map((table) => `'${table}'`).join(', ');
const allTenantTables = ['profiles', 'telegram_accounts', 'gmail_integrations', ...financialTables];
const allTenantTablesSql = allTenantTables.map((table) => `'${table}'`).join(', ');

const output = `
-- Dashboard Financiero SaaS audit SQL
-- Generated at ${new Date().toISOString()}
-- Paste into Supabase SQL Editor.

WITH expected_tables(table_name) AS (
  VALUES
    ('profiles'),
    ('telegram_accounts'),
    ('gmail_integrations'),
    ${financialTables.map((table) => `('${table}')`).join(',\n    ')}
)
SELECT
  expected_tables.table_name,
  to_regclass('public.' || expected_tables.table_name) IS NOT NULL AS exists
FROM expected_tables
ORDER BY expected_tables.table_name;

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (${tableListSql})
  AND column_name = 'profile_id'
ORDER BY table_name;

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'telegram_accounts', 'gmail_integrations', ${tableListSql})
ORDER BY tablename;

SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'telegram_accounts', 'gmail_integrations', ${tableListSql})
ORDER BY tablename, policyname;

CREATE TEMP TABLE IF NOT EXISTS saas_profile_id_audit (
  table_name text,
  status text,
  rows_without_profile_id bigint
) ON COMMIT DROP;

TRUNCATE saas_profile_id_audit;

DO $$
DECLARE
  table_name text;
  missing_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[${allTenantTablesSql}]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      INSERT INTO saas_profile_id_audit VALUES (table_name, 'missing_table', NULL);
    ELSIF table_name = 'profiles' THEN
      INSERT INTO saas_profile_id_audit VALUES (table_name, 'primary_profile_table', 0);
    ELSIF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND columns.table_name = table_name
        AND column_name = 'profile_id'
    ) THEN
      INSERT INTO saas_profile_id_audit VALUES (table_name, 'missing_profile_id_column', NULL);
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE profile_id IS NULL', table_name)
        INTO missing_count;
      INSERT INTO saas_profile_id_audit VALUES (
        table_name,
        CASE WHEN missing_count = 0 THEN 'ok' ELSE 'has_unscoped_rows' END,
        missing_count
      );
    END IF;
  END LOOP;
END $$;

SELECT *
FROM saas_profile_id_audit
ORDER BY table_name;
`.trim();

console.log(output);
