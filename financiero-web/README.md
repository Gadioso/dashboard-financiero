# Dashboard Financiero

Dashboard personal para aplicar la regla 33/33/33 con captura por Web, Telegram y agente financiero.

## Stack Actual

- Next.js 16 + React 19 para el dashboard y API routes.
- Supabase PostgreSQL para gastos, ingresos y presupuestos.
- Mastra para el agente financiero en `http://localhost:4111`.
- Telegram directo por webhook de Next, sin n8n.

## Servidores Locales

```bash
npm run dev -- -H 127.0.0.1 -p 3002
```

Dashboard:

```text
http://127.0.0.1:3002
```

Mastra Studio se corre desde la carpeta raíz del proyecto:

```bash
npm run dev
```

Mastra:

```text
http://localhost:4111
```

## Variables de Entorno

Crear `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://..."
SUPABASE_SERVICE_ROLE_KEY="..."

GOOGLE_API_KEY="..."
GEMINI_API_KEY="..."

TELEGRAM_BOT_TOKEN="..."
TELEGRAM_WEBHOOK_SECRET="..."
```

`SUPABASE_SERVICE_ROLE_KEY` es obligatoria para operaciones servidor como dashboard, webhooks, registros y borrados. El frontend no debe leer tablas de Supabase con anon key.

## Telegram

Endpoint local:

```text
POST /api/telegram/webhook
```

El bot es conversacional. Puedes pedir resumen, saludar o registrar movimientos en lenguaje natural:

```text
pagué 250 de gasolina
150 tacos
metí 1000 a cetes
500 fondo emergencia
cómo voy este mes
hola
150 taxi placeres
350 super vida
1000 cetes futuro
```

Aliases soportados:

```text
vida, v, fijo -> Vida
placer, placeres, p, salida -> Placeres
ahorro, inv, inversion, inversiones, futuro -> Futuro
```

Gemini clasifica categoría y subcategoría automáticamente cuando no incluyes una categoría explícita. Para casos comunes como café, tacos, CETES, emergencia, seguros, gasolina o renta, hay reglas locales para no depender siempre de cuota de IA.

Para Telegram real se necesita una URL publica. En local usa un tunel como ngrok o cloudflared y registra el webhook con Telegram usando `TELEGRAM_WEBHOOK_SECRET`.

## Arquitectura Sin n8n

El flujo queda directo:

```text
Telegram -> Next API Route -> Supabase -> Dashboard Realtime
Web IA -> Next API Route -> Gemini -> Supabase -> Dashboard Realtime
Mastra -> Supabase tools -> Dashboard Realtime
```

La logica compartida vive en `lib/financial-core.ts`.
