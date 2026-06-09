import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();

const tenantTables = [
  'gastos',
  'ingresos',
  'presupuestos_mensuales',
  'fondos_acumulados',
  'telegram_memoria',
  'santander_ingest_logs',
  'classification_preferences',
  'abonos_tarjeta_credito',
];

function readEnv() {
  const envPath = path.join(cwd, '.env.local');
  const env = { ...process.env };

  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
      if (value) env[key] = value;
    }
  }

  return env;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    apply: args.includes('--apply'),
    createAuthUser: args.includes('--create-auth-user'),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--profile-id') parsed.profileId = next;
    if (arg === '--email') parsed.email = next;
    if (arg === '--full-name') parsed.fullName = next;
    if (arg === '--telegram-chat-id') parsed.telegramChatId = next;
    if (arg === '--telegram-username') parsed.telegramUsername = next;
    if (arg === '--gmail-email') parsed.gmailEmail = next;
  }

  return parsed;
}

function assertUuid(value, label) {
  const trimmed = value?.trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!trimmed || !uuidPattern.test(trimmed)) {
    throw new Error(`${label} debe ser un UUID válido.`);
  }

  return trimmed;
}

function normalizeEmail(value) {
  const email = value?.trim().toLowerCase();

  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function countRowsWithoutProfile(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('profile_id', null);

  if (error) {
    return { table, available: false, error: error.message, count: null };
  }

  return { table, available: true, error: null, count: count || 0 };
}

async function backfillRows(supabase, table, profileId) {
  const { error } = await supabase
    .from(table)
    .update({ profile_id: profileId })
    .is('profile_id', null);

  if (error) return { table, success: false, error: error.message };

  return { table, success: true, error: null };
}

async function ensureProfile({ supabase, profileId, email, fullName, apply }) {
  const payload = {
    id: profileId,
    email,
    full_name: fullName || null,
    updated_at: new Date().toISOString(),
  };

  if (!apply) return { planned: true, payload };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('id, email, full_name, updated_at')
    .single();

  if (error) throw new Error(`No pude crear/actualizar profiles: ${error.message}`);

  return { planned: false, data };
}

async function createAuthUser({ supabase, email, fullName, apply }) {
  const temporaryPassword = crypto.randomBytes(24).toString('base64url');

  if (!apply) {
    return {
      planned: true,
      message: `Se crearía un usuario Auth para ${email}. No se muestra contraseña en dry-run.`,
    };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (error) throw new Error(`No pude crear usuario Auth: ${error.message}`);

  return {
    planned: false,
    userId: data.user?.id || null,
    email,
    note: 'Usuario Auth creado con contraseña temporal no impresa. Usa Supabase Auth para enviar reset de contraseña.',
  };
}

async function linkTelegram({ supabase, profileId, chatId, username, apply }) {
  if (!chatId) return null;

  const payload = {
    profile_id: profileId,
    chat_id: String(chatId),
    username: username || null,
    last_seen_at: new Date().toISOString(),
  };

  if (!apply) return { planned: true, payload };

  const { data, error } = await supabase
    .from('telegram_accounts')
    .upsert(payload, { onConflict: 'chat_id' })
    .select('id, profile_id, chat_id, username, last_seen_at')
    .single();

  if (error) throw new Error(`No pude vincular Telegram: ${error.message}`);

  return { planned: false, data };
}

async function linkGmail({ supabase, profileId, email, apply }) {
  if (!email) return null;

  const payload = {
    profile_id: profileId,
    email,
    provider: 'gmail',
    status: 'active',
    updated_at: new Date().toISOString(),
  };

  if (!apply) return { planned: true, payload };

  const { data, error } = await supabase
    .from('gmail_integrations')
    .upsert(payload, { onConflict: 'profile_id,email' })
    .select('id, profile_id, email, provider, status, updated_at')
    .single();

  if (error) throw new Error(`No pude vincular Gmail: ${error.message}`);

  return { planned: false, data };
}

async function main() {
  const env = readEnv();
  const args = parseArgs();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }

  const email = normalizeEmail(args.email || env.DASHBOARD_OWNER_EMAIL || env.EMAIL_INGEST_GMAIL_ADDRESS);
  const fullName = args.fullName || env.DASHBOARD_OWNER_FULL_NAME || 'Diego Gayoso';
  const telegramChatId = args.telegramChatId || env.TELEGRAM_NOTIFY_CHAT_ID;
  const telegramUsername = args.telegramUsername || env.TELEGRAM_NOTIFY_USERNAME;
  const gmailEmail = normalizeEmail(args.gmailEmail || env.EMAIL_INGEST_GMAIL_ADDRESS || env.DASHBOARD_OWNER_EMAIL);
  let profileId = args.profileId || env.DASHBOARD_PRIVATE_PROFILE_ID;

  if (!email && args.createAuthUser) {
    throw new Error('Para --create-auth-user necesitas --email o DASHBOARD_OWNER_EMAIL.');
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authUser = args.createAuthUser
    ? await createAuthUser({ supabase, email, fullName, apply: args.apply })
    : null;

  if (!profileId && authUser?.userId) {
    profileId = authUser.userId;
  }

  if (!profileId) {
    throw new Error('Falta DASHBOARD_PRIVATE_PROFILE_ID o --profile-id. Opcionalmente usa --create-auth-user --email <email> --apply.');
  }

  profileId = assertUuid(profileId, 'profileId');

  const counts = await Promise.all(tenantTables.map((table) => countRowsWithoutProfile(supabase, table)));
  const profile = await ensureProfile({ supabase, profileId, email, fullName, apply: args.apply });
  const telegram = await linkTelegram({ supabase, profileId, chatId: telegramChatId, username: telegramUsername, apply: args.apply });
  const gmail = await linkGmail({ supabase, profileId, email: gmailEmail, apply: args.apply });
  const backfill = args.apply
    ? await Promise.all(counts.filter((row) => row.available && row.count > 0).map((row) => backfillRows(supabase, row.table, profileId)))
    : counts.filter((row) => row.available && row.count > 0).map((row) => ({
        table: row.table,
        plannedRows: row.count,
      }));

  console.log(JSON.stringify({
    apply: args.apply,
    profileId,
    authUser,
    profile,
    telegram,
    gmail,
    rowsWithoutProfile: counts,
    backfill,
    nextSteps: args.apply
      ? [
          'Sube DASHBOARD_PRIVATE_PROFILE_ID y EMAIL_INGEST_PROFILE_ID a Vercel Production.',
          'Ejecuta npm run launch:check contra production.',
          'Prueba Telegram: "mi último gasto" y confirma que responde solo con datos del perfil.',
        ]
      : [
          'Dry-run solamente. Revisa rowsWithoutProfile/backfill.',
          'Para ejecutar cambios agrega --apply.',
          'Si necesitas crear usuario Auth, usa --create-auth-user --email <correo> --apply.',
        ],
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
