import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const mode = process.argv.includes('--multi-user') ? 'multi-user' : 'private-v1';

const migrationSets = {
  'private-v1': [
    '20260602_allow_dashboard_phase_and_santander_origin.sql',
    '20260603_create_telegram_memoria.sql',
    '20260605_create_classification_preferences.sql',
    '20260607_create_santander_ingest_logs.sql',
    '20260607_create_credit_card_payments.sql',
    '20260607_enable_rls_financial_tables.sql',
  ],
  'multi-user': [
    '20260608_multi_user_foundation.sql',
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
