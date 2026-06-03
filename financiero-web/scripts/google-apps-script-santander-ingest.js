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
    '-label:"' + SANTANDER_PROCESSED_LABEL + '"',
    '(',
    'from:santander',
    'OR subject:Santander',
    'OR "Santander te informa"',
    'OR "Banco Santander"',
    ')',
    '(',
    '"Compra por"',
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
  let sent = 0;
  let ignored = 0;

  threads.forEach((thread) => {
    const messages = thread.getMessages();
    let threadProcessed = false;

    messages.forEach((message) => {
      const payload = {
        gmailMessageId: message.getId(),
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

      if (result && result.success && !result.ignored) {
        sent += 1;
        threadProcessed = true;
      } else {
        ignored += 1;
      }
    });

    if (threadProcessed) {
      thread.addLabel(label);
    }
  });

  console.log(JSON.stringify({ sent, ignored, threads: threads.length }));
}
