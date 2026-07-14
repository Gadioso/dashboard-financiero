import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.01);
const enableLogs = process.env.NEXT_PUBLIC_SENTRY_ENABLE_LOGS === 'true';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs,
  tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.01,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
