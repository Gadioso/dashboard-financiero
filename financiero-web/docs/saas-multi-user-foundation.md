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

- Gmail push/watch renewal jobs and bank-email parsing from user-owned Gmail tokens.
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
- ✅ Diego user: `/api/account/status` shows `profileScoped: true` and non-zero counts for historical data.
- ✅ New beta user: `/api/account/status` shows `profileScoped: true`; initial counts start at `0`.
- ✅ New beta user write test: a manual Oxxo expense appears only for that user and keeps income/budget empty until income exists.
- ✅ New beta user income test: a manual $10,000 income appears only for that user and recalculates monthly budget thirds.
- ✅ Bank ingest status panel is scoped to the active user and uses neutral bank-facing copy.

## Paso 3 Onboarding Status

- ✅ Creating an account already creates or updates `profiles` automatically from Supabase Auth.
- ✅ `/onboarding` shows a per-user setup checklist.
- ✅ `/api/account/onboarding` saves name, monthly target, and creates an initial monthly budget scoped by `profile_id`.
- ✅ Telegram can be linked self-serve from onboarding with a temporary code sent to the bot.
- ✅ Gmail/Bank can be connected with Google OAuth from onboarding and stores encrypted user tokens.
- ✅ Gmail/Bank can now be synced from encrypted OAuth tokens through `/api/email/gmail/sync`.
- ✅ Vercel Cron is configured to call the Gmail sync route every 10 minutes.
- ✅ The dashboard exposes a configuration link and no longer addresses every user as Diego.
- ⚠️ Gmail `watch`/Pub/Sub push can still be added later for near-instant ingestion; the current production path is cron/manual sync without Apps Script.

## Self-Serve Integration Setup

Apply the onboarding migration after the multi-user foundation:

```bash
npm run sql:multi-user
```

Telegram self-serve linking needs:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_USERNAME`

Gmail OAuth needs a Google OAuth web client with this redirect URL:

```text
https://<your-domain>/api/account/gmail/oauth/callback
```

Configure these production variables:

- `GOOGLE_GMAIL_CLIENT_ID`
- `GOOGLE_GMAIL_CLIENT_SECRET`
- `GOOGLE_GMAIL_REDIRECT_URI`
- `GMAIL_OAUTH_STATE_SECRET`
- `GMAIL_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`

Gmail sync details:

- Manual user sync: `POST /api/email/gmail/sync` from an authenticated browser session.
- Scheduled sync: Vercel Cron calls `GET /api/email/gmail/sync` every 10 minutes with `Authorization: Bearer <CRON_SECRET>`.
- Default search query: `from:santander newer_than:14d`.
- Optional variables: `GMAIL_BANK_SEARCH_QUERY` and `GMAIL_SYNC_MAX_MESSAGES`.
- The sync route reuses `/api/email/santander`, so parsed movements, duplicates, logs, Telegram notifications, and `profile_id` scoping stay in one code path.
