# Gmail Santander Ingest

Objetivo: que `diegayoso1999@gmail.com` detecte correos de Santander y mande solo movimientos financieros al dashboard.

## Estado actual

- Endpoint Next.js: `POST /api/email/santander`
- Parser: `lib/santander-email-parser.ts`
- Criterios de clasificación: `docs/santander-classification-prompt.md`
- Script Gmail: `scripts/google-apps-script-santander-ingest.js`
- Seguridad: header `x-email-ingest-secret`
- Dedupe básico en Gmail: etiqueta `Finanzas/Procesado-Santander`
- Dedupe backend: evita insertar dos veces el mismo día + concepto + monto
- Validación backend: ignora payloads sin señal Santander aunque traigan formato de movimiento
- Notificación Telegram: cuando inserta un gasto nuevo de Santander, avisa la categoría detectada y da comandos para corregirla.

## Auditoría local

Para verificar que los puntos críticos del objetivo siguen correctos:

```bash
npm run audit:goal
```

El auditor revisa contra Supabase:

- Totales de enero importados desde Excel.
- Inversión GBM del 14 de abril.
- Presupuesto 33/33/33 de mayo.
- Que `Fase 1: Escudo` no aparezca en dashboard/Telegram/core.
- Promedio de ingresos de marzo-abril-mayo.

También puedes revisar el estado técnico de la ingesta:

```bash
curl http://127.0.0.1:3002/api/email/santander
```

Respuesta esperada antes de aplicar la migración SQL:

```json
{
  "success": true,
  "configured": {
    "supabase": true,
    "emailIngestSecret": true
  },
  "supabaseSchema": {
    "acceptsSantanderEmailOrigin": false,
    "acceptsRegla333333Phase": false,
    "migrationRequired": true
  }
}
```

## Requisito importante

Google Apps Script no puede llamar `http://127.0.0.1:3002`. Necesita una URL pública HTTPS:

- Producción recomendada: Vercel/Render/Railway con variables de entorno.
- Prueba temporal: túnel HTTPS tipo ngrok/cloudflared apuntando a `127.0.0.1:3002`.

## Variables necesarias en Next.js

```env
EMAIL_INGEST_SECRET=un-secret-largo-y-aleatorio
TELEGRAM_BOT_TOKEN=token-del-bot
TELEGRAM_NOTIFY_CHAT_ID=chat-id-opcional-para-alertas
```

El endpoint también usa como fallback `TELEGRAM_WEBHOOK_SECRET`, pero la configuración recomendada es tener `EMAIL_INGEST_SECRET` dedicado en `.env.local` y en producción. Ese mismo valor se pega en Apps Script como `EMAIL_INGEST_SECRET`.

`TELEGRAM_NOTIFY_CHAT_ID` es opcional si ya existe la tabla `telegram_memoria`; en ese caso el endpoint intenta avisar al último chat activo. Para producción estable, configura `TELEGRAM_NOTIFY_CHAT_ID`.

## Corrección por Telegram

Cuando entre un gasto nuevo por Santander, el bot manda algo así:

```txt
Santander registrado.
04 jun 2026 · $271.00 · STARBUCKS PATIO PATRIA
Lo clasifiqué como: Placeres / Cafe.
ID: abc12345
Si está mal, responde:
cámbialo a vida
cámbialo a placer
cámbialo a futuro
```

Comandos soportados:

```txt
cámbialo a vida
cámbialo a placer
cámbialo a futuro
cambiar abc12345 a vida
cambiar abc12345 a placeres
cambiar abc12345 a futuro
```

El ID corto queda como respaldo. Si respondes sin ID, el bot corrige el último gasto registrado o notificado en ese chat.

## Supabase SQL pendiente

Antes de guardar origen `Santander_Email` y quitar `Fase 1: Escudo`, ejecutar:

```sql
-- financiero-web/supabase/migrations/20260602_allow_dashboard_phase_and_santander_origin.sql
```

## Configurar Google Apps Script

1. Entrar a `https://script.google.com` con `diegayoso1999@gmail.com`.
2. Crear proyecto.
3. Pegar `scripts/google-apps-script-santander-ingest.js`.
4. En `Project Settings > Script properties`, agregar:
   - `ENDPOINT_URL`: `https://tu-dominio.com/api/email/santander`
   - `EMAIL_INGEST_SECRET`: el mismo secreto configurado en Next.js
5. Ejecutar `diagnosticarSantanderIngest` una vez. Debe imprimir la búsqueda, cantidad de threads y una muestra de correos Santander recientes.
6. Ejecutar `santanderIngest` una vez y aceptar permisos de Gmail.
7. Crear trigger:
   - Function: `santanderIngest`
   - Event source: `Time-driven`
   - Interval: cada 1 o 5 minutos

Para preparar las propiedades sin exponer el secret por accidente:

```bash
npm run gmail:props -- --endpoint=https://tu-dominio.com/api/email/santander
```

Cuando estés listo para copiar el secret completo:

```bash
npm run gmail:props -- --endpoint=https://tu-dominio.com/api/email/santander --show-secret
```

## Filtros actuales

El script busca correos recientes con señales:

- Remitente/asunto/texto Santander
- Movimientos tipo compra, cargo, retiro, depósito, abono, SPEI o transferencia recibida
- Guarda IDs de mensajes ya procesados en Script Properties (`SANTANDER_PROCESSED_MESSAGE_IDS`) para no depender de etiquetas por thread.
- Aplica la etiqueta visual `Finanzas/Procesado-Santander` como referencia, pero no la usa como única fuente de deduplicación.

El endpoint vuelve a validar el texto y solo inserta si:

- Hay señal Santander en remitente/asunto/cuerpo.
- El parser detecta monto y tipo de movimiento.
- No existe ya un movimiento con el mismo día, concepto y monto.
