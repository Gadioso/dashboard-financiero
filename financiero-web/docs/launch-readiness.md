# Launch readiness

## Estado recomendado antes de publicar v1 privada

- Aplicar migraciones pendientes en Supabase, incluyendo RLS.
- Rotar `SUPABASE_SERVICE_ROLE_KEY` si se compartió fuera de un gestor de secretos.
- Confirmar que `DASHBOARD_ACCESS_TOKEN` existe en Vercel Production.
- Ejecutar `npm run lint`.
- Ejecutar `npm run build`.
- Ejecutar `npm run test:santander-parser`.
- Ejecutar `npm run security:secrets`.
- Ejecutar `npm run data:audit`.
- Ejecutar `npm run budget:sync` y, si el dry-run es correcto, `npm run budget:sync -- --apply`.
- Ejecutar `LAUNCH_CHECK_BASE_URL=https://dashboard-financiero-chi.vercel.app LAUNCH_CHECK_DASHBOARD_TOKEN=... npm run launch:check`.
  - Debe confirmar login, migraciones launch aplicadas y escrituras públicas anon bloqueadas.
- Ejecutar el plan manual: [manual-test-plan.md](./manual-test-plan.md).
- Probar Telegram:
  - "mi id"
  - "últimos gastos"
  - "registrame 15000 de ingreso de Aire"
  - "cámbialo a placer"
  - "cuánto debo de tarjeta"
- Probar Gmail/Santander con un correo real o fixture.

## Limpieza de datos

`npm run data:audit` genera un reporte de:

- ingresos sospechosos que parecen texto informativo de Santander,
- duplicados por día, concepto y monto,
- presupuestos mensuales faltantes o desfasados,
- cargos y abonos de tarjeta Santander,
- errores o notificaciones pendientes en `santander_ingest_logs`.

`npm run data:cleanup-suspects` corre en modo `dry-run`.

Solo borra candidatos si se ejecuta explícitamente:

```bash
npm run data:cleanup-suspects -- --apply
```

## SQL de lanzamiento

Para v1 privada:

```bash
npm run sql:launch
```

Pega el SQL completo en Supabase SQL Editor.

Después de aplicarlo, `launch:check` debe reportar `Migraciones launch aplicadas` y `Escrituras públicas anon bloqueadas en Supabase`.

Para preparar SaaS multiusuario, no ejecutar todavía en producción sin auth real:

```bash
npm run sql:multi-user
```

Este bundle debe incluir `20260630_profile_scoped_monthly_budgets.sql`; es necesario para que `presupuestos_mensuales` deje de ser único globalmente por mes y pase a permitir presupuestos por usuario.

Para preparar la base agentica de modo negocio, tareas de agentes y wealth cockpit:

```bash
npm run sql:agentic-foundation
```

Aplicarlo solo despues de tener `profiles` y la base multiusuario en Supabase, porque las tablas nuevas dependen de `profile_id` y RLS por `auth.uid()`.

Para preparar la carga manual de CFDI/XML y conciliacion fiscal inicial:

```bash
npm run sql:cfdi-foundation
```

Aplicarlo despues de `sql:agentic-foundation`, porque puede asociar CFDI a `business_entities`.

## SAT / Syncfy Fiscal

El flujo Open Fiscal queda listo cuando se cumplen estos pasos, en orden:

1. Aplicar las migraciones `20260713_sat_core_foundation.sql`, `20260713204733_syncfy_fiscal_automation.sql`, `20260713205845_syncfy_fiscal_documents.sql` y `20260714000419_sat_compliance_automation.sql`.
2. Configurar `SYNCFY_API_KEY` y `SYNCFY_WEBHOOK_SECRET` en producción.
3. Capturar RFC, razón social, régimen SAT y código postal reales en `/fiscal`.
4. Introducir la CIEC únicamente dentro del Widget de Syncfy. La aplicación no recibe ni persiste la CIEC.
5. Verificar que el webhook de Syncfy apunte a `POST /api/bank/syncfy/webhook`; el mismo receptor distingue conexiones bancarias y fiscales.
6. Confirmar en `/fiscal` la descarga de CFDI/documentos y, con una opinión real, revisar el resultado 32-D y sus alertas.

Syncfy Stamping es un producto separado. Timbrado y cancelación sólo se habilitan cuando todas estas variables existen y los dos indicadores están en `true`:

```bash
SYNCFY_STAMPING_PRODUCT_ENABLED=true
SYNCFY_STAMPING_CSD_CONFIGURED=true
SYNCFY_STAMPING_API_KEY=...
SYNCFY_STAMPING_BASE_URL=https://...
SYNCFY_STAMPING_ISSUE_PATH=...
SYNCFY_STAMPING_CANCEL_PATH=...
```

El CSD y su contraseña se configuran con Syncfy; nunca se guardan en Git, Supabase ni variables de esta aplicación. Las rutas de Stamping deben copiarse del contrato técnico asignado a la cuenta, porque el producto no comparte el contrato de Open Data.

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
