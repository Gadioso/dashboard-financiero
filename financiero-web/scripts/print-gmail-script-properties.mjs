import fs from 'node:fs';

function readEnv() {
  const env = {};

  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    env[line.slice(0, index)] = line.slice(index + 1).trim().replace(/^"|"$/g, '');
  }

  return env;
}

const env = readEnv();
const showSecret = process.argv.includes('--show-secret');
const endpointUrl = process.argv.find((arg) => arg.startsWith('--endpoint='))?.replace('--endpoint=', '') || 'https://TU-DOMINIO.com/api/email/santander';
const secret = env.EMAIL_INGEST_SECRET || env.TELEGRAM_WEBHOOK_SECRET || '';
const visibleSecret = showSecret ? secret : `${secret.slice(0, 8)}...${secret.slice(-8)}`;

if (!secret) {
  console.error('Falta EMAIL_INGEST_SECRET en .env.local.');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ENDPOINT_URL: endpointUrl,
      EMAIL_INGEST_SECRET: visibleSecret,
      note: showSecret ? 'Copia estos valores a Google Apps Script > Project Settings > Script properties.' : 'Usa --show-secret para mostrar el secreto completo cuando estés listo para copiarlo.',
    },
    null,
    2
  )
);
