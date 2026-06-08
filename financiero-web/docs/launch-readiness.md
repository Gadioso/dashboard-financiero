# Launch readiness

## Estado recomendado antes de publicar v1 privada

- Aplicar migraciones pendientes en Supabase, incluyendo RLS.
- Rotar `SUPABASE_SERVICE_ROLE_KEY` si se compartió fuera de un gestor de secretos.
- Confirmar que `DASHBOARD_ACCESS_TOKEN` existe en Vercel Production.
- Ejecutar `npm run lint`.
- Ejecutar `npm run build`.
- Ejecutar `npm run test:santander-parser`.
- Ejecutar `LAUNCH_CHECK_BASE_URL=https://dashboard-financiero-chi.vercel.app LAUNCH_CHECK_DASHBOARD_TOKEN=... npm run launch:check`.
- Probar Telegram:
  - "mi id"
  - "últimos gastos"
  - "registrame 15000 de ingreso de Aire"
  - "cámbialo a placer"
  - "cuánto debo de tarjeta"
- Probar Gmail/Santander con un correo real o fixture.

## Criterio para SaaS multiusuario

Antes de abrirlo a usuarios externos:

- Usar auth real, no token compartido.
- Agregar `profile_id`/tenant en todas las tablas financieras.
- Aplicar RLS por usuario o tenant.
- Reemplazar Apps Script por Gmail OAuth + Pub/Sub.
- Mapear `telegram_chat_id` a `profile_id`.
- Usar queue/retry para ingesta de correo y notificaciones.
- Agregar observabilidad, alertas y auditoría de eventos.
- Hacer pruebas de carga por rutas críticas.

## Escala

- 10 usuarios: Vercel + Supabase con RLS puede funcionar.
- 100 usuarios: añadir auth, índices por `profile_id`, pooler y monitoreo.
- 1,000 usuarios: workers/queues para ingesta y backpressure.
- 100,000 usuarios: particionado, cache, compute dedicado y data warehouse.
- 1,000,000 usuarios: arquitectura multi-tenant avanzada, sharding/aislamiento, equipo de operación y compliance.
