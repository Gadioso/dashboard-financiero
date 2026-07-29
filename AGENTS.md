# AGENTS.md

Virafi is a TypeScript and Next.js application deployed as a Docker container on Railway. Supabase is the canonical database, authentication, storage, and scheduler. Google Gemini is the only AI provider; Stripe is the only paid product integration.

## Commands

```bash
npm run dev
npm test
npm run lint
npm run build
```

## Architecture boundaries

- Keep product and API code in `financiero-web`.
- Keep all schema changes in `financiero-web/supabase/migrations`.
- Use Supabase Cron as the only recurring scheduler.
- Keep every privileged query scoped by validated `profile_id`.
- Use schemas for AI tool inputs and keep financial writes behind deterministic confirmation.
- Add providers behind internal adapters; do not add active fallback vendors without an explicit product decision.

## Verification

- Read the installed Next.js documentation in `financiero-web/node_modules/next/dist/docs` before framework changes.
- Consult current Supabase documentation before database, Auth, Storage, RLS, or Cron changes.
- Run tests, lint, TypeScript, and the production build before handoff.

## Never

- Never commit `.env` files or secrets.
- Never expose Supabase service-role credentials to the browser.
- Never bypass RLS to fix an authorization problem.
- Never reintroduce hosting-specific runtime APIs when a standard Node.js implementation works.
