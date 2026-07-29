import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const mode = process.argv.includes('--multi-user')
  ? 'multi-user'
  : process.argv.includes('--agentic-foundation')
      ? 'agentic-foundation'
      : process.argv.includes('--classification-rules')
          ? 'classification-rules'
          : process.argv.includes('--billing')
            ? 'billing'
            : process.argv.includes('--operations')
              ? 'operations'
              : 'private-v1';

const migrationSets = {
  'private-v1': [
    '20260603000100_create_telegram_memoria.sql',
    '20260605000100_create_classification_preferences.sql',
    '20260607000300_enable_rls_financial_tables.sql',
  ],
  'multi-user': [
    '20260608000100_multi_user_foundation.sql',
    '20260612000100_self_serve_onboarding_integrations.sql',
    '20260630000300_profile_scoped_monthly_budgets.sql',
  ],
  'agentic-foundation': [
    '20260630000100_agentic_business_wealth_foundation.sql',
  ],
  'classification-rules': [
    '20260614000200_reclassify_tools_as_investments.sql',
    '20260630000200_default_expenses_to_pleasure.sql',
  ],
  'billing': [
    '20260615000100_billing_foundation.sql',
  ],
  'operations': [
    '20260615000200_operational_security_foundation.sql',
    '20260616000100_error_event_alerts.sql',
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
