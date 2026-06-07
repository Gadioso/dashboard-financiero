/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Google Apps Script para Gmail -> Dashboard Financiero.
 *
 * Uso:
 * 1. Crear un proyecto en https://script.google.com con la cuenta diegayoso1999@gmail.com.
 * 2. Pegar este archivo.
 * 3. Configurar Script Properties:
 *    - ENDPOINT_URL: https://tu-dominio.com/api/email/santander
 *    - EMAIL_INGEST_SECRET: el mismo secret configurado en Next.js
 * 4. Crear un trigger de tiempo para ejecutar santanderIngest cada 1 o 5 minutos.
 */

const SANTANDER_PROCESSED_LABEL = 'Finanzas/Procesado-Santander';
const SANTANDER_PROCESSED_IDS_PROPERTY = 'SANTANDER_PROCESSED_MESSAGE_IDS';
const SANTANDER_MAX_PROCESSED_IDS = 1000;

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);

  if (!value) {
    throw new Error(`Falta configurar Script Property: ${name}`);
  }

  return value;
}

function santanderSearchQuery_() {
  return [
    'newer_than:14d',
    '(',
    'from:santander',
    'OR subject:Santander',
    'OR "Santander te informa"',
    'OR "Banco Santander"',
    ')',
    '(',
    '"Compra por"',
    'OR "Pago/Compra con Tarjeta Santander"',
    'OR "compra en el comercio"',
    'OR "por un monto"',
    'OR "Cargo por"',
    'OR "Retiro por"',
    'OR "Depósito"',
    'OR "Deposito"',
    'OR "Abono"',
    'OR "SPEI"',
    'OR "Transferencia recibida"',
    ')',
  ].join(' ');
}

function readProcessedIds_() {
  const raw = PropertiesService.getScriptProperties().getProperty(SANTANDER_PROCESSED_IDS_PROPERTY);

  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('No pude leer IDs procesados, reinicio memoria local.', error);

    return {};
  }
}

function saveProcessedIds_(processedIds) {
  const entries = Object.entries(processedIds)
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
    .slice(0, SANTANDER_MAX_PROCESSED_IDS);

  PropertiesService.getScriptProperties().setProperty(
    SANTANDER_PROCESSED_IDS_PROPERTY,
    JSON.stringify(Object.fromEntries(entries))
  );
}

function plainText_(message) {
  const body = message.getPlainBody();

  if (body) return body;

  return message.getBody().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function postToDashboard_(payload) {
  const endpointUrl = getRequiredProperty_('ENDPOINT_URL');
  const secret = getRequiredProperty_('EMAIL_INGEST_SECRET');
  const response = UrlFetchApp.fetch(endpointUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-email-ingest-secret': secret,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(`Dashboard respondió ${status}: ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText());
}

function santanderIngest() {
  const label = GmailApp.getUserLabelByName(SANTANDER_PROCESSED_LABEL) || GmailApp.createLabel(SANTANDER_PROCESSED_LABEL);
  const threads = GmailApp.search(santanderSearchQuery_(), 0, 50);
  const processedIds = readProcessedIds_();
  let sent = 0;
  let ignored = 0;
  let skipped = 0;

  threads.forEach((thread) => {
    const messages = thread.getMessages();
    let threadProcessed = false;

    messages.forEach((message) => {
      const messageId = message.getId();

      if (processedIds[messageId]) {
        skipped += 1;
        return;
      }

      const payload = {
        gmailMessageId: messageId,
        from: message.getFrom(),
        subject: message.getSubject(),
        fecha: message.getDate().toISOString(),
        raw: [
          message.getSubject(),
          message.getFrom(),
          plainText_(message),
        ].join('\n\n'),
      };
      const result = postToDashboard_(payload);

      if (result && result.success) {
        processedIds[messageId] = new Date().toISOString();
        threadProcessed = true;

        if (result.ignored) {
          ignored += 1;
        } else {
          sent += 1;
        }
      } else {
        ignored += 1;
      }
    });

    if (threadProcessed) {
      thread.addLabel(label);
    }
  });

  saveProcessedIds_(processedIds);

  console.log(JSON.stringify({ sent, ignored, skipped, threads: threads.length }));
}

function diagnosticarSantanderIngest() {
  const query = santanderSearchQuery_();
  const threads = GmailApp.search(query, 0, 10);
  const processedIds = readProcessedIds_();
  const sample = [];

  threads.forEach((thread) => {
    thread.getMessages().forEach((message) => {
      sample.push({
        id: message.getId(),
        processed: Boolean(processedIds[message.getId()]),
        date: message.getDate().toISOString(),
        from: message.getFrom(),
        subject: message.getSubject(),
        snippet: message.getPlainBody().slice(0, 180).replace(/\s+/g, ' '),
      });
    });
  });

  console.log(JSON.stringify({ query, threads: threads.length, sample: sample.slice(0, 20) }, null, 2));
}
