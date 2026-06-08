import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const ignoredPathPatterns = [
  /^\.git\//,
  /^node_modules\//,
  /^\.next\//,
  /^financiero-web\/\.next\//,
  /^financiero-web\/node_modules\//,
  /^financiero-web\/public\/.*\.(ico|png|jpg|jpeg|svg|webp)$/i,
];

const secretPatterns = [
  { name: 'Supabase service role JWT', pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g },
  { name: 'Telegram bot token', pattern: /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/g },
  { name: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: 'Generic secret assignment', pattern: /\b(?:SERVICE_ROLE_KEY|BOT_TOKEN|API_KEY|ACCESS_TOKEN|INGEST_SECRET)\s*=\s*["']?[A-Za-z0-9._:-]{20,}/g },
];

function listTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function shouldIgnore(file) {
  return ignoredPathPatterns.some((pattern) => pattern.test(file));
}

const findings = [];

for (const file of listTrackedFiles()) {
  if (shouldIgnore(file)) continue;
  if (!fs.existsSync(file)) continue;

  const stat = fs.statSync(file);
  if (stat.size > 1024 * 1024) continue;

  const content = fs.readFileSync(file, 'utf8');

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      if (/\byour-|placeholder|example|dummy/i.test(match[0])) continue;

      const before = content.slice(0, match.index);
      const line = before.split('\n').length;
      findings.push({
        file,
        line,
        type: name,
        preview: `${match[0].slice(0, 8)}...${match[0].slice(-4)}`,
      });
    }
  }
}

console.log(JSON.stringify({ findings, count: findings.length }, null, 2));

if (findings.length > 0) {
  process.exitCode = 1;
}
