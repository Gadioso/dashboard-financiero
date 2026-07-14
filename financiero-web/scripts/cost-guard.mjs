import { readFile } from 'node:fs/promises';

const files = {
  policy: new URL('../lib/ai-policy.ts', import.meta.url),
  dashboard: new URL('../app/Components/DashboardFinanciero.tsx', import.meta.url),
  syncfyMigration: new URL('../supabase/migrations/20260713232932_disable_syncfy_polling_webhook_first.sql', import.meta.url),
  syncfyAutoSync: new URL('../app/api/bank/syncfy/auto-sync/route.ts', import.meta.url),
  syncfyWebhook: new URL('../app/api/bank/syncfy/webhook/route.ts', import.meta.url),
};

const [policy, dashboard, syncfyMigration, syncfyAutoSync, syncfyWebhook] = await Promise.all(Object.values(files).map((file) => readFile(file, 'utf8')));
const failures = [];

if (/defaults[\s\S]{0,500}openrouter\/auto/.test(policy)) failures.push('El router económico no debe usar openrouter/auto como modelo por defecto.');
if (!policy.includes("'openai/gpt-5-mini'")) failures.push('Falta GPT-5 Mini como modelo económico del agente.');
if (!policy.includes("'google/gemini-2.5-flash-lite'")) failures.push('Falta Gemini 2.5 Flash-Lite para tareas estructuradas.');

const dashboardPolls = [...dashboard.matchAll(/setInterval\([^;]{0,250},\s*(?:30_000|60000|60_000)\s*\)/g)];
if (dashboardPolls.length) failures.push('El dashboard reintrodujo polling cada 30 o 60 segundos.');

if (!syncfyMigration.includes('cron.unschedule')) failures.push('Falta la protección webhook-first que elimina el polling Syncfy por minuto.');
if (!syncfyAutoSync.includes("SYNCFY_AUTOMATIC_PULLS_ENABLED !== 'true'")) failures.push('Los pulls automáticos de Syncfy deben permanecer desactivados por defecto.');
if (!syncfyWebhook.includes('pullBeforeRead: false')) failures.push('El webhook debe leer los datos listos sin solicitar un pull pagado.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Cost guard OK: modelos económicos, polling del dashboard y Syncfy webhook-first verificados.');
}
