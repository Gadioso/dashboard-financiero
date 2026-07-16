import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const mode = process.argv.includes('--multi-user')
  ? 'multi-user'
  : process.argv.includes('--open-banking')
    ? 'open-banking'
    : process.argv.includes('--agentic-foundation')
      ? 'agentic-foundation'
      : process.argv.includes('--cfdi-foundation')
      ? 'cfdi-foundation'
      : process.argv.includes('--sat-core')
        ? 'sat-core'
        : process.argv.includes('--classification-rules')
          ? 'classification-rules'
          : process.argv.includes('--billing')
            ? 'billing'
            : process.argv.includes('--operations')
              ? 'operations'
              : 'private-v1';

const migrationSets = {
  'private-v1': [
    '20260602_allow_dashboard_phase_and_santander_origin.sql',
    '20260603_create_telegram_memoria.sql',
    '20260605_create_classification_preferences.sql',
    '20260607_create_santander_ingest_logs.sql',
    '20260607_create_credit_card_payments.sql',
    '20260609_add_santander_ingest_latency.sql',
    '20260607_enable_rls_financial_tables.sql',
  ],
  'multi-user': [
    '20260608_multi_user_foundation.sql',
    '20260612_self_serve_onboarding_integrations.sql',
    '20260630_profile_scoped_monthly_budgets.sql',
  ],
  'open-banking': [
    '20260613_open_banking_foundation.sql',
    '20260614_add_bank_connection_sync_cursor.sql',
    '20260622_bank_transaction_classification_queue.sql',
    '20260709_add_syncfy_open_banking_provider.sql',
    '20260709_syncfy_users.sql',
    '20260714210000_retire_santander_email_origin.sql',
  ],
  'agentic-foundation': [
    '20260630_agentic_business_wealth_foundation.sql',
  ],
  'cfdi-foundation': [
    '20260630190922_cfdi_manual_ingest_foundation.sql',
    '20260630194015_cfdi_reconciliation_dedupe_indexes.sql',
  ],
  'sat-core': [
    '20260713_sat_core_foundation.sql',
  ],
  'classification-rules': [
    '20260614_reclassify_tools_as_investments.sql',
    '20260630_default_expenses_to_pleasure.sql',
  ],
  'billing': [
    '20260615_billing_foundation.sql',
  ],
  'operations': [
    '20260615_operational_security_foundation.sql',
    '20260616_error_event_alerts.sql',
  ],
};

const migrationsDir = path.join(cwd, 'supabase', 'migrations');
const files = migrationSets[mode];

if (!files) {
  throw new Error(`Modo inválido: ${mode}`);
}

const output = [
  `-- Dashboard Financiero launch SQL bundle: ${mode}`,
  `-- Generated at ${new Date().toISOString()}`,
  '-- Pegar completo en Supabase SQL Editor y ejecutar una sola vez.',
  '',
  ...files.flatMap((file) => {
    const absolutePath = path.join(migrationsDir, file);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`No existe la migración ${file}`);
    }

    return [
      `-- -----------------------------------------------------------------------------`,
      `-- ${file}`,
      `-- -----------------------------------------------------------------------------`,
      fs.readFileSync(absolutePath, 'utf8').trim(),
      '',
    ];
  }),
].join('\n');

console.log(output);
