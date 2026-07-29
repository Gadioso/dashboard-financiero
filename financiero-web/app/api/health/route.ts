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
  whatsappAccessToken: 'WHATSAPP_ACCESS_TOKEN',
  whatsappPhoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID',
  whatsappAppSecret: 'WHATSAPP_APP_SECRET',
  whatsappWebhookVerifyToken: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  whatsappGraphApiVersion: 'WHATSAPP_GRAPH_API_VERSION',
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  stripeSecret: 'STRIPE_SECRET_KEY',
  stripeWebhook: 'STRIPE_WEBHOOK_SECRET',
  stripeBetaPrice: 'STRIPE_PRICE_BETA_MONTHLY',
  stripePremiumPrice: 'STRIPE_PRICE_PREMIUM_MONTHLY',
};

function envConfigured() {
  return Object.fromEntries(
    Object.entries(requiredEnv).map(([label, key]) => [
      label,
      Array.isArray(key) ? key.some((name) => Boolean(process.env[name])) : Boolean(process.env[key]),
    ])
  );
}

function capabilities() {
  const env = envConfigured();
  const hasTranscriptionProvider = Boolean(env.gemini);
  const hasTelegramWebhook = Boolean(env.telegramBot && env.telegramWebhook);
  const hasWhatsAppWebhook = Boolean(env.whatsappAppSecret && env.whatsappWebhookVerifyToken);
  const hasWhatsAppSending = Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId && env.whatsappGraphApiVersion);

  return {
    telegramText: hasTelegramWebhook,
    telegramVoice: hasTelegramWebhook && hasTranscriptionProvider,
    whatsappWebhook: hasWhatsAppWebhook,
    whatsappSending: hasWhatsAppSending,
    whatsappAssistant: hasWhatsAppWebhook && hasWhatsAppSending && process.env.WHATSAPP_CHANNEL_MODE === 'assistant' && process.env.WHATSAPP_AI_POLICY_APPROVED === 'true',
    aiAnalysis: Boolean(env.gemini),
    transcriptionProviders: {
      gemini: Boolean(env.gemini),
      preferred: env.gemini ? 'gemini' : null,
    },
  };
}

export async function GET(request: Request) {
  const healthcheckSecret = process.env.HEALTHCHECK_SECRET || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const receivedSecret = request.headers.get('x-healthcheck-secret') || '';
  const bearerToken = (request.headers.get('authorization') || '').replace(/^bearer\s+/i, '').trim();
  const detailed = Boolean(
    healthcheckSecret && receivedSecret === healthcheckSecret ||
    cronSecret && bearerToken === cronSecret
  );

  return NextResponse.json({
    success: true,
    status: 'ok',
    app: 'dashboard-financiero',
    timestamp: new Date().toISOString(),
    ...(detailed
      ? {
          env: envConfigured(),
          capabilities: capabilities(),
        }
      : {}),
  });
}
