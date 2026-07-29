# Virafi Web

Next.js 16 application deployed as a standalone Node.js container on Railway.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Verification

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run security:secrets
```

## Production architecture

- Railway: container runtime, deployments, networking and logs.
- Supabase: Postgres, Auth, Storage, RLS and Cron.
- Google Gemini: chat, tool agent, structured analysis, documents and audio transcription.
- Stripe: subscriptions and payments.
- Telegram: optional user and operations channel.

Virafi does not connect to bank accounts. Users register movements manually or through Telegram.

The maintained service inventory is in [`docs/third-party-inventory.md`](docs/third-party-inventory.md).

`railway.json` configures the Docker build and `/api/health` deployment check. Set this directory as the Railway service Root Directory.

Supabase Cron calls the stable `https://virafi.com` domain. Do not create a second scheduler in Railway.
