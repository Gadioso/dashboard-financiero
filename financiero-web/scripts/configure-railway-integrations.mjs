import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
const stripeEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

function required(name) {
  const value = process.env[name] || "";
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function railwayUrl() {
  const domain = process.env.RAILWAY_VALIDATION_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || required("RAILWAY_PUBLIC_DOMAIN");
  return /^https?:\/\//.test(domain) ? domain.replace(/\/$/, "") : `https://${domain}`;
}

function setRailwayVariable(name, value, { deploy = false } = {}) {
  const args = ["variable", "set", name, "--stdin"];
  if (!deploy) args.push("--skip-deploys");

  const result = spawnSync("railway", args, {
    input: value,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Could not set ${name}: ${result.stderr.trim()}`);
  }
}

async function telegram(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${required("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram ${method} failed.`);
  }
  return payload.result;
}

async function prepare() {
  const publicUrl = railwayUrl();
  const webhookUrl = `${publicUrl}/api/billing/webhook`;
  const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  let stripeEndpoint = existing.data.find((endpoint) => endpoint.url === webhookUrl)
    || existing.data.find((endpoint) => endpoint.metadata?.platform === "railway" && endpoint.metadata?.app === "virafi");
  let stripeSecretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

  if (!stripeEndpoint) {
    stripeEndpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: stripeEvents,
      description: "Virafi Railway production",
      metadata: { platform: "railway", app: "virafi" },
    });
    if (!stripeEndpoint.secret) throw new Error("Stripe did not return a webhook signing secret.");
    setRailwayVariable("STRIPE_WEBHOOK_SECRET", stripeEndpoint.secret);
    stripeSecretConfigured = true;
  } else if (stripeEndpoint.url !== webhookUrl) {
    stripeEndpoint = await stripe.webhookEndpoints.update(stripeEndpoint.id, {
      url: webhookUrl,
      enabled_events: stripeEvents,
      description: "Virafi Railway production",
    });
  }

  if (!stripeSecretConfigured) {
    throw new Error(`Stripe endpoint ${stripeEndpoint.id} already exists but its signing secret is unavailable.`);
  }

  const bot = await telegram("getMe");
  const telegramSecret = randomBytes(32).toString("hex");
  setRailwayVariable("TELEGRAM_WEBHOOK_SECRET", telegramSecret);
  if (bot.username) setRailwayVariable("TELEGRAM_BOT_USERNAME", bot.username);
  if (bot.first_name) setRailwayVariable("TELEGRAM_BOT_DISPLAY_NAME", bot.first_name);

  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const accounts = await supabase
    .from("telegram_accounts")
    .select("chat_id,last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1);
  if (accounts.error) throw new Error(`Could not read Telegram account: ${accounts.error.message}`);
  if (accounts.data?.[0]?.chat_id) {
    const notifyChatId = String(accounts.data[0].chat_id).trim();
    if (notifyChatId === String(bot.id)) {
      throw new Error("Refusing to set TELEGRAM_NOTIFY_CHAT_ID to the bot's own id. Send /mi_id to Virafi from the user chat and use that chat_id.");
    }
    setRailwayVariable("TELEGRAM_NOTIFY_CHAT_ID", notifyChatId);
  }

  setRailwayVariable("BUILD_REVISION", `integrations-${Date.now()}`, { deploy: true });

  console.log(JSON.stringify({
    prepared: true,
    publicUrl,
    stripeEndpointId: stripeEndpoint.id,
    stripeMode: required("STRIPE_SECRET_KEY").startsWith("sk_live_") ? "live" : "test",
    stripeEvents: stripeEvents.length,
    telegramBot: bot.username ? `@${bot.username}` : bot.first_name || "configured",
    telegramNotifyChatConfigured: Boolean(accounts.data?.[0]?.chat_id),
    deploymentTriggered: true,
  }, null, 2));
}

async function activate() {
  const publicUrl = railwayUrl();
  const telegramUrl = `${publicUrl}/api/telegram/webhook`;
  const telegramSecret = required("TELEGRAM_WEBHOOK_SECRET");

  await telegram("setWebhook", {
    url: telegramUrl,
    secret_token: telegramSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  const telegramStatus = await telegram("getWebhookInfo");

  const healthResponse = await fetch(`${publicUrl}/api/health`, {
    headers: { "x-healthcheck-secret": required("HEALTHCHECK_SECRET") },
  });
  const health = await healthResponse.json();

  const stripeProbe = await fetch(`${publicUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "stripe-signature": "invalid-probe" },
    body: "{}",
  });

  console.log(JSON.stringify({
    activated: true,
    publicUrl,
    telegramUrlMatches: telegramStatus.url === telegramUrl,
    telegramPendingUpdates: telegramStatus.pending_update_count || 0,
    telegramLastError: telegramStatus.last_error_message || null,
    healthOk: healthResponse.ok && health?.success === true,
    telegramTextReady: health?.capabilities?.telegramText === true,
    telegramVoiceReady: health?.capabilities?.telegramVoice === true,
    stripeSignatureGuardReady: stripeProbe.status === 400,
  }, null, 2));
}

if (mode === "prepare") {
  await prepare();
} else if (mode === "activate") {
  await activate();
} else {
  console.error("Usage: node scripts/configure-railway-integrations.mjs <prepare|activate>");
  process.exit(1);
}
