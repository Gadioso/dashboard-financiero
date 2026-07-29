# ADR-001: Monolito modular en Railway, Supabase y Gemini

Estado: aceptada, 2026-07-28.

## Decisión

Virafi se ejecuta como una aplicación Next.js standalone en Railway. Supabase es el único sistema de registro, autenticación, almacenamiento y programación recurrente. Gemini es el único proveedor de IA.

Stripe se conserva para procesar suscripciones. Telegram permanece como canal opcional. El acceso bancario en tiempo real queda fuera del producto por su coste mínimo desproporcionado; los movimientos se capturan manualmente o mediante Telegram.

Se retiran Mastra, Vercel Runtime/Cron, AI Gateway, OpenRouter, OpenAI directo, Sentry, Syncfy, Plaid y Prometeo.

## Límites

- Next.js contiene UI, API, lógica de negocio y ejecución de agentes.
- Supabase contiene datos canónicos, RLS, auditoría, leases e idempotencia.
- Supabase Cron sólo activa endpoints protegidos; no contiene lógica financiera compleja.
- Gemini puede redactar y consultar herramientas de sólo lectura. Las escrituras financieras siguen rutas determinísticas con confirmación.
- Los proveedores externos se encapsulan detrás de módulos internos para permitir reemplazo sin duplicar integraciones activas.

## Escalamiento

El contenedor es stateless y puede tener múltiples réplicas. Los trabajos usan leases en Postgres para evitar duplicados. La base de datos escala mediante compute y pooler de Supabase. Si una tarea supera el tiempo razonable de una petición, se añadirá una cola durable en Supabase antes de incorporar otro proveedor.

## Operación

Los errores de negocio se guardan en `error_events`; auditoría en `audit_events`; logs técnicos salen por stdout/stderr hacia Railway. El dominio `virafi.com` es el contrato estable para webhooks y tareas, independientemente del host.
