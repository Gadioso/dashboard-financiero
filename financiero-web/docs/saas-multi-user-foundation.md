# SaaS Multi-User Foundation

This project still runs safely as Diego's private dashboard by default. The SaaS path is now staged behind optional tenant variables and a Supabase migration.

## Current Private Mode

- The dashboard remains protected by `DASHBOARD_ACCESS_TOKEN`.
- Backend routes use `SUPABASE_SERVICE_ROLE_KEY`.
- If `DASHBOARD_PRIVATE_PROFILE_ID` is empty, existing private rows with `profile_id = null` continue to work.
- Gmail/Santander and Telegram keep using the same private data path unless a profile id is configured.

## Tenant Variables

Use these only after creating an authenticated profile in Supabase Auth:

- `DASHBOARD_PRIVATE_PROFILE_ID`: profile id for the private dashboard/session.
- `EMAIL_INGEST_PROFILE_ID`: profile id used by the Gmail/Santander Apps Script ingestion. Falls back to `DASHBOARD_PRIVATE_PROFILE_ID`.

Telegram resolves a profile through `telegram_accounts.chat_id`. If no mapping exists, it falls back to the private profile id.

## Private Account Linking Endpoints

These endpoints are protected by the existing private dashboard cookie. They are intended for the transition phase before the full SaaS auth UI exists.

Check current account wiring:

```bash
curl -s https://<your-domain>/api/account/status \
  -H "Cookie: dashboard_auth=<DASHBOARD_ACCESS_TOKEN>"
```

Link Diego's Telegram chat to the configured private profile:

```bash
curl -s -X POST https://<your-domain>/api/account/link-telegram \
  -H "Cookie: dashboard_auth=<DASHBOARD_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"945363158","username":"Diego Gayoso"}'
```

Link the Gmail address used by Santander ingestion:

```bash
curl -s -X POST https://<your-domain>/api/account/link-gmail \
  -H "Cookie: dashboard_auth=<DASHBOARD_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"email":"diegayoso1999@gmail.com"}'
```

The endpoints require `DASHBOARD_PRIVATE_PROFILE_ID`; otherwise they fail clearly instead of creating unscoped SaaS records.

## Database Migration

Apply `supabase/migrations/20260608_multi_user_foundation.sql` only when the project is ready for Supabase Auth.

The migration:

- Creates `profiles`, `telegram_accounts`, and `gmail_integrations`.
- Adds nullable `profile_id` columns to financial tables.
- Adds tenant indexes.
- Enables RLS and policies using `auth.uid()`.
- Keeps historical rows nullable until they are assigned to a profile.

After the Diego profile exists in `auth.users`, backfill historical rows:

```sql
UPDATE gastos SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE ingresos SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE presupuestos_mensuales SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE fondos_acumulados SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE telegram_memoria SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE santander_ingest_logs SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE classification_preferences SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
UPDATE abonos_tarjeta_credito SET profile_id = '<DIEGO_AUTH_USER_ID>' WHERE profile_id IS NULL;
```

## Bootstrap Script

Use the bootstrap script after the multi-user migration exists in Supabase.

Dry-run:

```bash
npm run tenant:bootstrap
```

Apply using an existing Supabase Auth user id:

```bash
DASHBOARD_PRIVATE_PROFILE_ID="<DIEGO_AUTH_USER_ID>" npm run tenant:bootstrap -- --apply
```

Or create a Supabase Auth user and use that id automatically:

```bash
npm run tenant:bootstrap -- --create-auth-user --email diegayoso1999@gmail.com --apply
```

The script:

- Creates or updates the `profiles` row.
- Links `TELEGRAM_NOTIFY_CHAT_ID` into `telegram_accounts`.
- Links `EMAIL_INGEST_GMAIL_ADDRESS` into `gmail_integrations`.
- Backfills historical rows with `profile_id` where `profile_id IS NULL`.
- Never prints Supabase service keys or generated temporary passwords.

After successful apply, set these variables in Vercel Production:

- `DASHBOARD_PRIVATE_PROFILE_ID=<DIEGO_AUTH_USER_ID>`
- `EMAIL_INGEST_PROFILE_ID=<DIEGO_AUTH_USER_ID>`

## What Is Already Tenant-Aware

- Dashboard reads through `/api/dashboard`.
- Manual movement registration through `/api/procesar-gasto`.
- Telegram conversation reads, writes, category changes, deletions, and memory.
- Gmail/Santander ingestion, duplicates, ingest logs, notifications, and classification preferences.
- Income and expense deletes.
- Monthly budget sync.
- Admin reclassification through `/api/admin/reclasificar-gastos`.

## What Still Needs Product Work Before Commercial Launch

- Real authentication UI and onboarding.
- A user-owned Google/Gmail connection flow instead of one shared Apps Script.
- Telegram account linking per user.
- Billing and plan limits.
- Admin observability, audit logs, and abuse/rate-limit controls.
- Production data retention and deletion flows.
