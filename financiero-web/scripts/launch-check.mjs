import fs from 'node:fs';

const baseUrl = process.env.LAUNCH_CHECK_BASE_URL || 'http://127.0.0.1:3000';
const dashboardToken = process.env.DASHBOARD_ACCESS_TOKEN || process.env.LAUNCH_CHECK_DASHBOARD_TOKEN || '';
const checksLocalEnv = process.env.CHECK_LOCAL_ENV === 'true' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(baseUrl);
const requiredEnvKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DASHBOARD_ACCESS_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_NOTIFY_CHAT_ID',
  'EMAIL_INGEST_SECRET',
];

function readEnvLocal() {
  if (!fs.existsSync('.env.local')) return {};

  const env = {};
  const lines = fs.readFileSync('.env.local', 'utf8').split(/\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
    env[key] = value;
  }

  return env;
}

function assertCheck(condition, message, details = '') {
  if (!condition) {
    return { status: 'fail', message, details };
  }

  return { status: 'pass', message, details };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
  const text = await response.text();

  return { response, text };
}

async function main() {
  const envLocal = readEnvLocal();
  const checks = [];

  for (const key of requiredEnvKeys) {
    const configured = Boolean(process.env[key] || envLocal[key]);
    checks.push(
      checksLocalEnv
        ? assertCheck(configured, `Env configurada: ${key}`)
        : {
            status: configured ? 'pass' : 'warn',
            message: `Env local no verificada para Production: ${key}`,
            details: configured ? 'Disponible localmente.' : 'Se valida por comportamiento HTTP en Production.',
          }
    );
  }

  const root = await request('/');
  checks.push(
    assertCheck(
      root.response.status === 307 || root.response.status === 308 || root.response.url.includes('/login'),
      'Dashboard raíz redirige a login sin cookie',
      `status=${root.response.status} location=${root.response.headers.get('location') || ''}`
    )
  );

  const blockedDashboard = await request('/api/dashboard?mes=2026-06');
  checks.push(
    assertCheck(
      blockedDashboard.response.status === 401,
      'API dashboard rechaza acceso sin cookie',
      `status=${blockedDashboard.response.status} body=${blockedDashboard.text.slice(0, 160)}`
    )
  );

  const blockedSantanderStatus = await request('/api/email/santander');
  checks.push(
    assertCheck(
      blockedSantanderStatus.response.status === 401,
      'Estado Santander interno rechaza acceso sin cookie',
      `status=${blockedSantanderStatus.response.status}`
    )
  );

  if (dashboardToken) {
    const login = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: dashboardToken, next: '/' }),
    });
    const cookie = login.response.headers.get('set-cookie') || '';
    checks.push(
      assertCheck(
        login.response.status === 200 && cookie.includes('dashboard_auth='),
        'Login genera cookie httpOnly',
        `status=${login.response.status}`
      )
    );

    if (cookie) {
      const dashboard = await request('/api/dashboard?mes=2026-06', {
        headers: { Cookie: cookie },
      });
      checks.push(
        assertCheck(
          dashboard.response.status === 200 && dashboard.text.includes('"success":true'),
          'API dashboard responde con cookie válida',
          `status=${dashboard.response.status}`
        )
      );

      const santanderStatus = await request('/api/email/santander', {
        headers: { Cookie: cookie },
      });
      checks.push(
        assertCheck(
          santanderStatus.response.status === 200 && santanderStatus.text.includes('"success":true'),
          'Estado Santander responde con cookie válida',
          `status=${santanderStatus.response.status}`
        )
      );
    }
  } else {
    checks.push({
      status: 'warn',
      message: 'No se probó login con cookie porque no se proporcionó DASHBOARD_ACCESS_TOKEN/LAUNCH_CHECK_DASHBOARD_TOKEN.',
      details: '',
    });
  }

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');

  console.log(JSON.stringify({ baseUrl, checks, failed: failed.length, warned: warned.length }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
