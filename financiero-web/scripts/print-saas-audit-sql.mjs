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

const nullProfileChecks = financialTables.map((table) => `
SELECT '${table}' AS table_name, count(*) AS rows_without_profile_id
FROM public.${table}
WHERE profile_id IS NULL
`).join('UNION ALL');

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

${nullProfileChecks};

SELECT
  'telegram_accounts_without_profile' AS check_name,
  count(*) AS count
FROM public.telegram_accounts
WHERE profile_id IS NULL
UNION ALL
SELECT
  'gmail_integrations_without_profile' AS check_name,
  count(*) AS count
FROM public.gmail_integrations
WHERE profile_id IS NULL;
`.trim();

console.log(output);
