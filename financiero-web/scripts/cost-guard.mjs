import { readFile } from 'node:fs/promises';

const files = {
  gemini: new URL('../lib/gemini.ts', import.meta.url),
  dashboard: new URL('../app/Components/DashboardFinanciero.tsx', import.meta.url),
  retiredBanking: new URL('../supabase/migrations/20260729165627_retire_open_banking.sql', import.meta.url),
};

const [gemini, dashboard, retiredBanking] = await Promise.all(Object.values(files).map((file) => readFile(file, 'utf8')));
const failures = [];

if (/OPENROUTER|OPENAI_API_KEY|AI_GATEWAY/.test(gemini)) failures.push('Gemini debe ser el único proveedor activo de IA.');
if (!gemini.includes("'gemini-2.5-flash-lite'")) failures.push('Falta Gemini 2.5 Flash-Lite para tareas estructuradas.');
if (!gemini.includes("'gemini-2.5-flash'")) failures.push('Falta Gemini 2.5 Flash para conversación y herramientas.');

const dashboardPolls = [...dashboard.matchAll(/setInterval\([^;]{0,250},\s*(?:30_000|60000|60_000)\s*\)/g)];
if (dashboardPolls.length) failures.push('El dashboard reintrodujo polling cada 30 o 60 segundos.');

if (/SYNCFY|\/api\/bank\//i.test(dashboard)) failures.push('El dashboard no debe reintroducir conexiones bancarias.');
if (!retiredBanking.includes('cron.unschedule') || !retiredBanking.includes('drop table if exists public.bank_connections')) failures.push('Falta retirar el cron y las tablas de banking.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Cost guard OK: Gemini único, dashboard sin polling y banking retirado.');
}
