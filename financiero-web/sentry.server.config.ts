import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.01);
const enableLogs = process.env.SENTRY_ENABLE_LOGS === 'true';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs,
  tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.01,
});
