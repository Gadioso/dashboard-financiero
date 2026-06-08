import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const requiredEnv = {
  dashboardAuth: 'DASHBOARD_ACCESS_TOKEN',
  supabaseUrl: 'NEXT_PUBLIC_SUPABASE_URL',
  supabaseAnon: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  supabaseServiceRole: 'SUPABASE_SERVICE_ROLE_KEY',
  telegramBot: 'TELEGRAM_BOT_TOKEN',
  telegramWebhook: 'TELEGRAM_WEBHOOK_SECRET',
  telegramNotifyChat: 'TELEGRAM_NOTIFY_CHAT_ID',
  emailIngest: 'EMAIL_INGEST_SECRET',
  gemini: 'GEMINI_API_KEY',
};

function envConfigured() {
  return Object.fromEntries(
    Object.entries(requiredEnv).map(([label, key]) => [label, Boolean(process.env[key])])
  );
}

export async function GET(request: Request) {
  const healthcheckSecret = process.env.HEALTHCHECK_SECRET || '';
  const receivedSecret = request.headers.get('x-healthcheck-secret') || '';
  const detailed = Boolean(healthcheckSecret && receivedSecret === healthcheckSecret);

  return NextResponse.json({
    success: true,
    status: 'ok',
    app: 'dashboard-financiero',
    timestamp: new Date().toISOString(),
    ...(detailed
      ? {
          env: envConfigured(),
        }
      : {}),
  });
}
