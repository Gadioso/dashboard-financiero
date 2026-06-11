# SaaS Multi-User Foundation

This project still runs safely as Diego's private dashboard by default. The SaaS path is now staged behind optional tenant variables and a Supabase migration.

## Current Private Mode

- The dashboard remains protected by `DASHBOARD_ACCESS_TOKEN`.
- Backend routes use `SUPABASE_SERVICE_ROLE_KEY`.
- If `DASHBOARD_PRIVATE_PROFILE_ID` is empty, existing private rows with `profile_id = null` continue to work only in local/private transitional paths.
- Production webhooks do not silently write to the private data path when they cannot resolve a user profile.

## Tenant Variables

Use these only after creating an authenticated profile in Supabase Auth:

- `DASHBOARD_PRIVATE_PROFILE_ID`: profile id for the private dashboard/session.
- `EMAIL_INGEST_PROFILE_ID`: explicit profile id used by the legacy Gmail/Santander Apps Script ingestion.

Telegram resolves a profile through `telegram_accounts.chat_id`. In production, unknown chats are rejected with a link request instead of falling back to the private profile.

Gmail/Santander resolves a profile through `gmail_integrations.email` when the Apps Script sends `ingestEmail`. If no active Gmail mapping or explicit `EMAIL_INGEST_PROFILE_ID` exists in production, the ingestion is rejected with `409 link-gmail`.

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

Audit the live Supabase project after applying migrations:

```bash
npm run sql:saas-audit
```

Paste the output in Supabase SQL Editor. It verifies table existence, `profile_id` columns, RLS, policies, and remaining rows without `profile_id`.

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

## Paso 1 Audit Status

- ✅ Tables and migrations define `profiles`, `telegram_accounts`, `gmail_integrations`, and `profile_id`.
- ✅ Financial routes use `profile_id` filters before returning or mutating user data.
- ✅ Login uses Supabase Auth for email/password, Google, and GitHub.
- ✅ Production unauthenticated API requests return `401` instead of falling into Diego's private profile.
- ✅ Telegram and Gmail/Santander now require a linked profile before writing production financial rows.
- ⚠️ Live Supabase RLS must still be confirmed from Supabase SQL Editor with `npm run sql:saas-audit`.
- ⚠️ `/api/account/status` must be checked after a real Google/GitHub login to confirm current-production `profileScoped: true`.

## OAuth Login For Commercial SaaS

The login UI supports Supabase Auth with:

- Email and password.
- Google OAuth through `/api/auth/oauth?provider=google`.
- GitHub OAuth through `/api/auth/oauth?provider=github`.

Both OAuth providers return to `/auth/callback`, finalize the Supabase browser session, set `sb_access_token` and `sb_refresh_token` through `/api/auth/callback`, and upsert the `profiles` row using `auth.users.id` as the tenant `profile_id`.

Supabase Dashboard setup:

1. Enable Google and GitHub under Authentication -> Providers.
2. Add the production callback URL to Authentication -> URL Configuration -> Redirect URLs:

```text
https://<your-domain>/auth/callback
```

3. Add the local callback URL while testing:

```text
http://localhost:3000/auth/callback
```

4. Configure each external provider with the callback URL shown by Supabase for that provider, for example `https://<project-ref>.supabase.co/auth/v1/callback`. Google also needs the app origin, for example `https://<your-domain>` and local `http://localhost:3000`.
5. To avoid Google showing the raw Supabase project URL on the consent screen, configure Google Auth Platform branding and later add a Supabase custom auth domain such as `auth.<your-domain>`.

## What Still Needs Product Work Before Commercial Launch

- Onboarding after first OAuth login to collect preferred name, budget targets, Telegram, and Gmail connection.
- A user-owned Google/Gmail connection flow instead of one shared Apps Script.
- Telegram account linking per user.
- Billing and plan limits.
- Admin observability, audit logs, and abuse/rate-limit controls.
- Production data retention and deletion flows.

## Paso 2 Private Beta Status

- ✅ Login/signup UI separates sign in from account creation and keeps Google/GitHub OAuth available.
- ✅ `/api/account/status` returns `profileScoped`, linked Telegram/Gmail accounts, and per-profile financial row counts.
- ✅ Dashboard data is read through profile-scoped API routes.
- ✅ Supabase RLS and `profile_id` isolation are confirmed for all tenant tables.
- ✅ Telegram and Gmail/Santander production ingestion require a linked profile before writing.
- ✅ Verification gates passed locally: `npm run lint`, `npm run build`, `npm run security:secrets`, `npm run test:santander-parser`.
- ⚠️ Final beta acceptance still needs live checks with two real accounts:
  - New beta user: `/api/account/status` should show `profileScoped: true` and all `financialCounts` at `0`.
  - Diego user: `/api/account/status` should show `profileScoped: true` and non-zero counts for his historical data.
  - Register one test expense/income and confirm only that active user sees it.
