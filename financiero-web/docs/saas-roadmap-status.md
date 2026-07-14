# SaaS roadmap status

## Vision unicornio: plataforma financiera agentica

Estado: definido.

- Nueva tesis documentada en [agentic-finance-platform.md](./agentic-finance-platform.md).
- El producto evoluciona de dashboard financiero personal a plataforma B2B2C/B2B-first.
- La arquitectura objetivo usa orquestacion de subagentes: intake/clasificacion, AI CFO, presupuesto/metas, flujo de caja, fiscal-contable Mexico, integraciones, crecimiento, riesgo/anomalias, contador/despacho y compliance.
- El modo personal y el modo negocio se vuelven ejes de producto.
- SAT/CFDI, contador mexicano, open banking y portal de despacho quedan como rutas estrategicas para construir defensibilidad en Mexico/LatAm.
- Wealth cockpit agregado: portafolio, inversiones, Binance read-only, Polymarket research/paper, research fundamental, analisis tecnico, riesgo de inversiones y ejecucion supervisada por fases.
- Paper simulation/PnL agregado: `GET/POST /api/investments/paper-trades` abre simulaciones desde tesis y `PATCH /api/investments/paper-trades/[id]` cierra/cancela con PnL simulado.
- Siguiente corte recomendado: separacion formal de agentes intake/AI CFO, scoring historico de oportunidades y post-mortem de tesis cerradas.
- Base SQL iniciada: `20260630_agentic_business_wealth_foundation.sql` crea modo negocio, tareas/hallazgos de agentes, modelo de inversiones, paper trading, trade intents, limites de riesgo y disclosures.
- Bundle operativo agregado: `npm run sql:agentic-foundation`.
- Base CFDI manual agregada: `20260630190922_cfdi_manual_ingest_foundation.sql`, `GET/POST /api/cfdi/documents`, panel fiscal en Wealth cockpit y bundle `npm run sql:cfdi-foundation`.
- Conciliacion banco-CFDI agregada: `POST /api/cfdi/reconcile`, eventos recientes en Wealth cockpit e indices anti-duplicado en `20260630194015_cfdi_reconciliation_dedupe_indexes.sql`.
- Market sync read-only agregado: `GET/POST /api/investments/market-sync` sincroniza Binance Spot 24h y mercados publicos de Polymarket a `market_assets` y `market_data_snapshots`.
- Investment research agent agregado: `GET/POST /api/investments/research-agent` crea tesis auditables en `investment_theses` desde snapshots, perfil de riesgo y activos permitidos.
- Score historico/post-mortem agregado: `GET/POST /api/investments/paper-trades` devuelve scorecard de simulaciones y `PATCH /api/investments/paper-trades/[id]` cierra la tesis ligada con `evidence.postMortem`.

## Paso 1: Auditoria Supabase/Auth/OAuth

Estado: listo.

- Tablas multiusuario confirmadas.
- Tablas financieras con `profile_id`.
- RLS activo.
- Login real con Supabase Auth.
- `/api/account/status` responde con `profileScoped`.
- Produccion no cae al perfil privado cuando no hay sesion.
- Gmail y Telegram pertenecen a un usuario.

## Paso 2: Beta privada multiusuario

Estado: listo.

- Login/signup funcional.
- Dashboard por usuario.
- Datos aislados.
- Usuario nuevo empieza vacio.
- Usuario Diego conserva data.
- Telegram, Gmail/Banco y movimientos usan `profile_id`.
- Build/lint/security check pasan.
- Pendiente de SQL en producción: aplicar `20260630_profile_scoped_monthly_budgets.sql` para que `presupuestos_mensuales` permita una fila por `profile_id + mes_anio`; sin esto, un usuario beta con ingreso en el mismo mes que Diego no puede crear su propio presupuesto mensual.

## Paso 3: Onboarding

Estado: funcional, en mejora.

- Crear cuenta.
- Perfil automatico.
- Presupuestos iniciales.
- Telegram self-serve.
- Gmail como fallback.
- Banco por pais con proveedor interno.
- Estado de configuracion.
- Script operativo agregado: `npm run budget:sync` recalcula presupuestos por ingresos reales y crea presupuestos faltantes cuando el constraint por perfil ya está aplicado.

## Paso 4: Gmail OAuth real

Estado: beta/fallback.

- OAuth con Google implementado.
- Tokens por usuario cifrados.
- Lectura de correos por usuario.
- Dedupe por `gmail_message_id`.
- Logs por usuario en `santander_ingest_logs`.
- Limitante: verificacion de Google para uso masivo con `gmail.readonly`.

## Paso 5: Telegram multiusuario

Estado: listo.

- `telegram_chat_id` vinculado a `profile_id`.
- Registro en perfil correcto.
- Memoria separada.
- Link code self-serve.
- Comandos de desconexion/revocacion.

## Paso 6: Billing y planes

Estado: base implementada.

- Stripe Checkout para suscripcion premium.
- Stripe Customer Portal.
- Webhook de suscripciones.
- Tablas `billing_customers` y `billing_subscriptions` con RLS.
- Estado de plan en `/api/account/status`.
- Badge y acciones de plan en dashboard.
- Limites por plan para nuevas conexiones de banco, Gmail y Telegram.
- Bloqueo de cupo con respuesta 402 en endpoints de conexion.
- Pendiente: crear producto/precio real en Stripe, configurar webhook, correr `sql:billing` y activar variables de produccion.

## Paso 7: Seguridad y operacion

Estado: base operativa completada.

- Rate limit base.
- Secret scan.
- RLS.
- Auditoria de acciones por usuario en `audit_events`.
- Logs de errores por usuario en `error_events`.
- Exportacion JSON por usuario en `GET /api/account/export`.
- Borrado de datos por usuario en `DELETE /api/account/data`.
- Monitor de errores y alertas Telegram en `GET /api/ops/error-alerts`.
- Integracion Sentry opcional para cliente, server, edge y errores manejados.
- Sentry activo y verificado extremo a extremo en produccion.
- Verificador de restore seguro para staging con `npm run restore:verify`.
- Checklist operativo de backups/restore y rotacion de secrets.
- Primer restore logico real ejecutado y verificado en staging el 2026-06-18.

## Paso 8: Escala

Estado: en progreso.

- Indices por `profile_id` en tablas principales.
- Open Banking foundation.
- Plaid Link sandbox.
- Plaid sync crudo a `bank_accounts` y `bank_transactions_raw`.
- Cola base de clasificacion para movimientos bancarios crudos.
- Worker manual `POST /api/bank/transactions/classify` con lotes limitados.
- Backpressure inicial con `BANK_CLASSIFICATION_BATCH_SIZE`.
- Auditoria de procesadas, clasificadas, fallidas y pendientes restantes.
- Clasificacion ajustada el 2026-06-30: todo gasto no identificado como herramienta, inversión, emergencia o seguro cae por defecto en `Placeres`.
- Pendiente: cron/worker externo, monitoreo de costos por proveedor y clasificacion asincrona continua.
