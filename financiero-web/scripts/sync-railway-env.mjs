import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const sourcePath = process.argv[2];

if (!sourcePath) {
  console.error("Usage: node scripts/sync-railway-env.mjs <env-file|--process>");
  process.exit(1);
}

const allowedNames = new Set([
  "AI_INTENT_LLM_ENABLED",
  "CRON_SECRET",
  "DASHBOARD_ACCESS_TOKEN",
  "DASHBOARD_PRIVATE_PROFILE_ID",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_STRUCTURED_MODEL",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STRIPE_PRICE_BETA_MONTHLY",
  "STRIPE_PRICE_PREMIUM_MONTHLY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_DISPLAY_NAME",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_NOTIFY_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
]);

function parseEnv(contents) {
  const values = new Map();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!allowedNames.has(name)) continue;

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replaceAll("\\n", "\n");
    if (!value) continue;

    values.set(name, value);
  }

  return values;
}

const variables = sourcePath === "--process"
  ? new Map(
      [...allowedNames]
        .filter((name) => typeof process.env[name] === "string" && process.env[name] !== "")
        .map((name) => [name, process.env[name]]),
    )
  : parseEnv(readFileSync(sourcePath, "utf8"));

for (const [name, value] of variables) {
  if (/^\[(SENSITIVE|REDACTED)\]$/i.test(value)) {
    console.error(`Refusing placeholder value for ${name}.`);
    process.exit(1);
  }
}

if (!variables.has("GEMINI_API_KEY")) {
  const compatibleGeminiKey = variables.get("GOOGLE_API_KEY")
    || variables.get("GOOGLE_GENERATIVE_AI_API_KEY");
  if (compatibleGeminiKey) variables.set("GEMINI_API_KEY", compatibleGeminiKey);
}
variables.delete("GOOGLE_API_KEY");
variables.delete("GOOGLE_GENERATIVE_AI_API_KEY");

for (const [name, value] of variables) {
  const result = spawnSync(
    "railway",
    ["variable", "set", name, "--stdin", "--skip-deploys"],
    { input: value, encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error(`Failed to set ${name}: ${result.stderr.trim()}`);
    process.exit(result.status ?? 1);
  }

  console.log(`Set ${name}`);
}

console.log(`Transferred ${variables.size} application variables.`);
