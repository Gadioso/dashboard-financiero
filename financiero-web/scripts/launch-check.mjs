import fs from 'node:fs';

const baseUrl = process.env.LAUNCH_CHECK_BASE_URL || 'http://127.0.0.1:3000';
const dashboardToken = process.env.DASHBOARD_ACCESS_TOKEN || process.env.LAUNCH_CHECK_DASHBOARD_TOKEN || '';
const healthcheckSecret = process.env.HEALTHCHECK_SECRET || process.env.CRON_SECRET || '';
const checksLocalEnv = process.env.CHECK_LOCAL_ENV === 'true' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(baseUrl);
const requiredEnvKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DASHBOARD_ACCESS_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_NOTIFY_CHAT_ID',
  'EMAIL_INGEST_SECRET',
];
const optionalCapabilityEnvKeys = [
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
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

  const aiCapabilities = {
    openrouter: Boolean(process.env.OPENROUTER_API_KEY || envLocal.OPENROUTER_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY || envLocal.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || envLocal.GEMINI_API_KEY || envLocal.GOOGLE_API_KEY),
  };
  const hasAnyTranscriptionProvider = aiCapabilities.openrouter || aiCapabilities.openai || aiCapabilities.gemini;

  for (const key of optionalCapabilityEnvKeys) {
    const configured = Boolean(process.env[key] || envLocal[key]);
    checks.push({
      status: configured ? 'pass' : 'warn',
      message: `Capacidad IA opcional: ${key}`,
      details: configured
        ? 'Disponible para analisis/transcripcion segun el flujo.'
        : 'No configurada; se usaran proveedores alternos si existen.',
    });
  }

  checks.push(
    checksLocalEnv
      ? assertCheck(
          hasAnyTranscriptionProvider,
          'Transcripcion de voz tiene al menos un proveedor configurado',
          JSON.stringify(aiCapabilities)
        )
      : {
          status: hasAnyTranscriptionProvider ? 'pass' : 'warn',
          message: 'Transcripcion de voz tiene al menos un proveedor configurado localmente',
          details: hasAnyTranscriptionProvider
            ? JSON.stringify(aiCapabilities)
            : 'No se pudo inferir Production desde env local; usa health detallado con CRON_SECRET/HEALTHCHECK_SECRET.',
        }
  );

  checks.push({
    status: aiCapabilities.openrouter ? 'pass' : 'warn',
    message: 'OpenRouter configurado como proveedor preferente de voz',
    details: aiCapabilities.openrouter
      ? 'OPENROUTER_API_KEY disponible.'
      : 'Falta OPENROUTER_API_KEY; la voz cae a OpenAI/Gemini si estan configurados.',
  });

  const root = await request('/');
  checks.push(
    assertCheck(
      root.response.status === 307 || root.response.status === 308 || root.response.url.includes('/login'),
      'Dashboard raíz redirige a login sin cookie',
      `status=${root.response.status} location=${root.response.headers.get('location') || ''}`
    )
  );

  const publicHealth = await request('/api/health');
  checks.push(
    assertCheck(
      publicHealth.response.status === 200 && publicHealth.text.includes('"success":true') && !publicHealth.text.includes('"env"'),
      'Health publico responde sin exponer env',
      `status=${publicHealth.response.status}`
    )
  );

  if (healthcheckSecret) {
    const detailedHealth = await request('/api/health', {
      headers: {
        Authorization: `Bearer ${healthcheckSecret}`,
      },
    });
    let healthPayload = null;

    try {
      healthPayload = JSON.parse(detailedHealth.text);
    } catch {
      healthPayload = null;
    }

    checks.push(
      assertCheck(
        detailedHealth.response.status === 200 && Boolean(healthPayload?.capabilities),
        'Health detallado reporta capacidades operativas',
        `status=${detailedHealth.response.status}`
      )
    );

    if (healthPayload?.capabilities) {
      checks.push(
        assertCheck(
          healthPayload.capabilities.telegramVoice === true,
          'Telegram voice esta funcional segun health detallado',
          JSON.stringify(healthPayload.capabilities.transcriptionProviders || {})
        )
      );

      checks.push({
        status: healthPayload.capabilities.transcriptionProviders?.openrouter ? 'pass' : 'warn',
        message: 'Production usa OpenRouter como proveedor preferente de voz',
        details: JSON.stringify(healthPayload.capabilities.transcriptionProviders || {}),
      });
    }
  } else {
    checks.push({
      status: 'warn',
      message: 'No se reviso health detallado porque falta HEALTHCHECK_SECRET o CRON_SECRET local.',
      details: '',
    });
  }

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
      let santanderStatusPayload = null;
      try {
        santanderStatusPayload = JSON.parse(santanderStatus.text);
      } catch {
        santanderStatusPayload = null;
      }
      checks.push(
        assertCheck(
          santanderStatus.response.status === 200 && santanderStatus.text.includes('"success":true'),
          'Estado Santander responde con cookie válida',
          `status=${santanderStatus.response.status}`
        )
      );
      if (santanderStatusPayload?.supabaseSchema) {
        checks.push(
          assertCheck(
            santanderStatusPayload.supabaseSchema.migrationRequired === false,
            'Migraciones launch aplicadas',
            JSON.stringify(santanderStatusPayload.supabaseSchema)
          )
        );
        checks.push(
          assertCheck(
            santanderStatusPayload.supabaseSchema.publicWritesBlocked === true,
            'Escrituras públicas anon bloqueadas en Supabase',
            santanderStatusPayload.supabaseSchema.publicWritesReason || ''
          )
        );
      }
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
