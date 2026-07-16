# Agentic finance platform

## Tesis

El producto debe evolucionar de dashboard financiero personal a una plataforma de inteligencia financiera orquestada por agentes para personas, freelancers, creadores, despachos contables y PyMEs pequenas.

La posicion aspiracional no es "otra app para registrar gastos". Es:

> Un AI CFO operativo para LatAm que entiende finanzas personales, finanzas de negocio, bancos, CFDI/SAT, flujo de caja, impuestos, deuda, tarjetas y decisiones de crecimiento.

La vision extendida es un panel financiero completo: dinero diario, negocio, impuestos, deuda, patrimonio, portafolios e inteligencia de mercados en una sola experiencia.

La ruta comercial recomendada es B2B2C/B2B-first sin abandonar el B2C:

- B2C como entrada, laboratorio de experiencia y adopcion personal.
- Prosumer para freelancers, consultores, creadores y founders que mezclan dinero personal y negocio.
- B2B para PyMEs pequenas que necesitan tesoreria, control de gasto, forecast, impuestos y reportes sin contratar CFO.
- B2B2C para despachos contables, comunidades de emprendedores, neobancos, bancos, payroll y plataformas de pagos.

## Principios de producto

- El usuario no captura contabilidad; conversa con una empresa financiera virtual.
- Cada subagente tiene una especialidad clara y entrega decisiones accionables.
- El orquestador decide que agente interviene, cruza hallazgos y evita respuestas contradictorias.
- El modo personal y el modo negocio comparten identidad, bancos e historial, pero separan reglas, reportes y permisos.
- SAT/CFDI y contabilidad mexicana son una ventaja competitiva, no un modulo accesorio.
- Gmail/Santander está retirado como origen. La ruta escalable es open banking, SAT/CFDI, conectores contables y APIs oficiales/proveedores autorizados.
- Inversiones y trading deben empezar como read-only, research y paper trading. La ejecucion real requiere permisos explicitos, controles de riesgo, cumplimiento regulatorio y, probablemente, partners regulados.
- El producto puede sugerir tesis, escenarios y alertas, pero debe distinguir entre educacion financiera, research general, recomendacion personalizada y ejecucion regulada.

## Modos principales

### Modo personal

Para usuarios que quieren controlar presupuesto, tarjetas, metas, ahorro, inversion, deuda y habitos.

Capacidades:

- Presupuesto flexible basado en 33/33/33, ajustable por ingresos reales.
- Clasificacion automatica de movimientos.
- Registro por web, voz, Telegram y eventualmente WhatsApp.
- Coach financiero conversacional.
- Alertas de gastos, deuda, pagos recurrentes y metas.
- Score personal de salud financiera.
- Recomendaciones de ahorro, inversion y riesgo.

### Modo negocio

Para freelancers, creadores, profesionales independientes y PyMEs.

Capacidades:

- Separacion automatica personal/negocio.
- Ingresos por cliente, canal, producto o proyecto.
- Gastos deducibles, operativos, herramientas, nomina, impuestos, deuda y crecimiento.
- Forecast de flujo de caja 30/60/90 dias.
- Runway y capacidad de pago personal.
- Alertas de liquidez, concentracion de clientes y gastos anormales.
- Reportes para contador y cierre mensual.
- Multiusuario: owner, contador, operador, viewer.

## Orquestacion de subagentes

El sistema debe sentirse como una firma financiera interna. El usuario habla con una interfaz unica, pero por debajo hay subagentes especializados.

### 1. Orquestador financiero

Rol:

- Recibe la intencion del usuario.
- Decide si responder, registrar, consultar, pedir confirmacion o activar varios agentes.
- Mantiene contexto de modo personal/negocio.
- Resume la respuesta final con prioridades y acciones.

Herramientas:

- Perfil del usuario/empresa.
- Estado de conexiones.
- Memoria financiera.
- Politicas de seguridad y permisos.
- Cola de tareas asincronas.

### 2. Agente de intake y clasificacion

Rol:

- Convierte texto, voz, Telegram, email, banco y CFDI en movimientos normalizados.
- Deduplica.
- Clasifica categoria, subcategoria, modo personal/negocio, deducibilidad y confianza.
- Pide confirmacion cuando el impacto sea alto o la confianza baja.

Salidas:

- `normalized_transactions`
- `classification_events`
- `needs_review`

### 3. AI CFO conversacional

Rol:

- Responde preguntas de negocio y vida financiera.
- Traduce datos en decisiones.
- Detecta prioridades de crecimiento, caja y riesgo.

Preguntas objetivo:

- "Puedo contratar a alguien?"
- "Cuanto puedo pagarme este mes?"
- "Que gasto recorto sin frenar crecimiento?"
- "Me alcanza para impuestos?"
- "Que cliente me esta dejando margen?"
- "Voy bien para mi meta anual?"

### 4. Agente de presupuesto y metas

Rol:

- Administra 33/33/33 en modo personal.
- En modo negocio administra utilidad, reinversion, impuestos, owner pay y runway.
- Sincroniza presupuestos mensuales con ingresos reales.

Salidas:

- Presupuesto recomendado.
- Riesgo de sobregasto.
- Metas y aportaciones sugeridas.

### 5. Agente de flujo de caja y tesoreria

Rol:

- Proyecta caja 30/60/90 dias.
- Detecta pagos recurrentes, cuentas por cobrar, tarjetas, deuda y obligaciones.
- Simula escenarios.

Salidas:

- Forecast base, optimista y conservador.
- Alertas de liquidez.
- Recomendaciones de timing.

### 6. Agente fiscal-contable Mexico

Rol:

- Integra CFDI/SAT, deducibles, facturas emitidas/recibidas, complementos de pago y posibles discrepancias.
- Genera reportes para contador.
- No sustituye asesoria fiscal; prepara evidencia, conciliacion y alertas.

Integraciones recomendadas:

- SAT Descarga Masiva de CFDI y retenciones para CFDI emitidos/recibidos.
- Proveedor PAC/API para emision/timbrado cuando el producto llegue a modo negocio serio.
- Exportacion contable a CSV/Excel y despues CONTPAQi, Bind ERP, Alegra, QuickBooks o similar.

Notas actuales:

- El SAT mantiene documentacion oficial del servicio web de Descarga Masiva de CFDI y retenciones.
- CFDI 4.0 es la base vigente para facturacion electronica en Mexico.
- La integracion debe manejar e.firma/certificados con cifrado fuerte, consentimiento explicito, auditoria, revocacion y separacion por `profile_id`.

### 7. Agente de integraciones

Rol:

- Administra proveedores de datos y su estado.
- Prioriza open banking sobre scraping/email.
- Detecta fallas, expiracion de consentimientos y huecos de datos.

Fuentes:

- Plaid para Estados Unidos.
- Prometeo, Belvo y Finerio Connect para LatAm/Mexico.
- Gmail/Santander como fallback.
- SAT/CFDI para Mexico.
- Telegram/WhatsApp para captura conversacional.
- Stripe/Mercado Pago y facturacion como rutas futuras.
- Binance para crypto read-only primero, usando API oficial y demo/testnet antes de cualquier operacion.
- Polymarket para market data, research y paper trading; ejecucion real queda fuera de la primera etapa.

### 8. Agente de crecimiento financiero

Rol:

- Ayuda a crecer patrimonio o empresa.
- Encuentra palancas de ingreso, margen, ahorro, pricing, cobranza y retencion.
- Convierte datos financieros en plan semanal.

Salidas:

- "Top 3 acciones de esta semana".
- Riesgos a vigilar.
- Oportunidades de expansion.
- Experimentos comerciales.

### 9. Agente de riesgo, fraude y anomalias

Rol:

- Detecta duplicados, cargos raros, abonos sospechosos, fugas de suscripciones y cambios de patron.
- Genera alertas y tareas de revision.

Salidas:

- Alertas por severidad.
- Lista de movimientos para confirmar.
- Evidencia y trazabilidad.

### 10. Agente de contador/despacho

Rol:

- Da una vista multi-cliente para contadores.
- Prioriza pendientes por cliente: CFDI faltantes, movimientos sin clasificar, discrepancias banco-SAT, reportes mensuales y documentos.

Modelo comercial:

- Plan por despacho.
- Precio por cliente activo.
- Portal colaborativo con permisos.

### 11. Agente de compliance y privacidad

Rol:

- Revisa permisos, RLS, exportacion/borrado, auditoria, manejo de tokens y datos sensibles.
- Bloquea acciones peligrosas sin confirmacion.

Salidas:

- Checklist de lanzamiento.
- Evidencia de cumplimiento.
- Alertas de configuracion.

### 12. Agente de inversiones y portafolio

Rol:

- Unifica patrimonio liquido, inversiones tradicionales, crypto, prediction markets y efectivo.
- Calcula exposicion por clase de activo, moneda, riesgo, liquidez, horizonte y concentracion.
- Sugiere asignaciones objetivo segun metas, tolerancia al riesgo y flujo de caja.
- Identifica desbalances: exceso de efectivo, sobreexposicion a crypto, falta de fondo de emergencia, demasiada concentracion en una tesis.

Fuentes iniciales:

- Movimientos propios clasificados como inversion.
- Saldos manuales.
- Binance read-only.
- Polymarket paper/research.
- GBM/CETES/Fintual/Kuspit u otros conectores futuros segun disponibilidad.

Salidas:

- Patrimonio neto.
- Allocation actual vs objetivo.
- Riesgo de concentracion.
- Rebalanceos sugeridos.
- Tareas de investigacion antes de invertir.

### 13. Agente de research fundamental

Rol:

- Evalua oportunidades por tesis, catalizadores, datos macro, valuacion, calidad del activo y riesgos.
- Para empresas: negocio, ingresos, margen, deuda, crecimiento, ventaja competitiva y precio.
- Para crypto: tokenomics, liquidez, unlocks, actividad on-chain, seguridad, dependencia de narrativa y riesgo regulatorio.
- Para Polymarket: probabilidad implicita, liquidez, spread, resolucion, fuentes de verdad y riesgo de sesgo.

Salidas:

- Tesis bullish/base/bearish.
- Variables clave a monitorear.
- Riesgos que invalidan la tesis.
- Nivel de confianza y evidencia.

### 14. Agente de analisis tecnico y microestructura

Rol:

- Analiza tendencia, momentum, volatilidad, soportes/resistencias, volumen, drawdown, spread y liquidez.
- No debe operar solo por indicadores; debe cruzarse con research fundamental y riesgo de portafolio.

Salidas:

- Setup tecnico.
- Zonas de entrada/salida hipoteticas.
- Riesgo/recompensa.
- Senales invalidadas por baja liquidez o spread alto.

### 15. Agente de riesgo de inversiones

Rol:

- Decide tamano maximo sugerido por posicion.
- Bloquea ideas incompatibles con fondo de emergencia, flujo de caja o deuda cara.
- Controla limites por activo, plataforma, moneda, tema y liquidez.
- Calcula escenarios de perdida antes de cualquier recomendacion accionable.

Reglas base:

- No sugerir inversion si el usuario no tiene fondo de emergencia minimo.
- No recomendar apalancamiento a usuarios no sofisticados.
- No permitir ejecucion automatica sin confirmacion explicita.
- Separar capital personal, negocio, impuestos y trading.

### 16. Agente de ejecucion supervisada

Rol:

- Fase avanzada. Prepara ordenes, pero no las ejecuta sin confirmacion humana.
- Valida precio, liquidez, slippage, fees, limites, permisos y motivo de la orden.
- Mantiene bitacora de decision: tesis, riesgo, fuente de senal, confirmacion y resultado.

Fases:

1. Read-only: solo consulta saldos, precios y posiciones.
2. Paper trading: simula entradas, salidas, PnL y disciplina.
3. Order staging: prepara ordenes y manda al usuario a confirmar en el broker/exchange.
4. Ejecucion desde la app: solo con partner regulado, permisos, compliance, auditoria y controles fuertes.

### 17. Agente de mercados predictivos

Rol:

- Integra Polymarket como fuente de probabilidades, research y, eventualmente, paper trading especializado.
- Convierte mercados en tesis medibles con probabilidad implicita, liquidez, spread, resolucion y edge estimado.
- Puede alimentar escenarios macro y de negocio, no solo apuestas.

Regla actual:

- Polymarket debe mantenerse paper-only hasta tener evidencia suficiente de PnL, copy-trading medible, geografia permitida, compliance y controles de ejecucion.

## Arquitectura tecnica objetivo

### Capa de experiencia

- Web dashboard.
- Chat/voz en web.
- Telegram actual.
- WhatsApp futuro.
- Portal contador/despacho.

### Capa de orquestacion

- Mastra como orquestador de agentes y workflows.
- Un agente orquestador registrado en `src/mastra/index.ts`.
- Subagentes especializados con tools limitadas por dominio.
- Workflows para procesos definidos: onboarding, cierre mensual, forecast, conciliacion SAT-banco, revision fiscal.

### Capa de datos

Tablas actuales a conservar y extender:

- `profiles`
- `gastos`
- `ingresos`
- `presupuestos_mensuales`
- `fondos_acumulados`
- `telegram_accounts`
- `telegram_memoria`
- `gmail_integrations`
- `bank_connections`
- `bank_accounts`
- `bank_transactions_raw`
- `billing_customers`
- `billing_subscriptions`
- `audit_events`
- `error_events`

Tablas nuevas recomendadas:

- `business_entities`: empresas/actividades de un usuario.
- `business_members`: permisos por empresa.
- `transaction_splits`: parte personal/negocio/deducible de un movimiento.
- `cashflow_forecasts`: escenarios de caja.
- `fiscal_profiles`: RFC, regimen, obligaciones, contador asignado.
- `cfdi_integrations`: estado de conexion SAT/PAC por perfil o empresa.
- `cfdi_documents`: XML/metadata normalizada de CFDI.
- `cfdi_reconciliation_events`: cruces banco-CFDI y discrepancias.
- `accountant_clients`: relacion despacho-cliente.
- `agent_tasks`: tareas generadas por agentes.
- `agent_findings`: hallazgos accionables con evidencia.
- `investment_accounts`: cuentas de inversion, exchange, broker o wallet por usuario/empresa.
- `investment_positions`: posiciones actuales normalizadas por activo, plataforma y moneda.
- `investment_transactions`: compras, ventas, deposits, withdrawals, fees, rewards y ajustes.
- `market_assets`: catalogo normalizado de activos, tokens, acciones, ETFs, mercados predictivos e instrumentos.
- `market_data_snapshots`: precios, orderbook, volumen, spread, volatilidad y datos tecnicos.
- `investment_theses`: tesis de inversion con evidencia, riesgos, horizonte y estado.
- `paper_trades`: simulaciones de ordenes y PnL antes de operar real.
- `trade_intents`: ordenes preparadas pendientes de confirmacion humana.
- `risk_limits`: limites por usuario, cuenta, activo, clase, plataforma y modo.
- `advisor_disclosures`: consentimientos, perfil de riesgo, disclaimers y version de politicas aceptadas.

### Seguridad

- Todo dato financiero y fiscal debe estar aislado por `profile_id` y, cuando aplique, `business_entity_id`.
- Tokens bancarios, OAuth, e.firma/certificados y secretos fiscales deben cifrarse con llaves rotables.
- Cada accion del agente que escriba datos debe dejar auditoria.
- Acciones fiscales, borrados, reclasificaciones masivas y cambios de permisos requieren confirmacion explicita.

## Roadmap recomendado

### Fase 1: Fundacion agentica sobre lo actual

Objetivo: transformar el agente financiero actual en una arquitectura de empresa financiera virtual.

- Crear documento de contratos de subagentes.
- Crear orquestador Mastra con routing por intencion.
- Separar agente de registro/clasificacion del agente conversacional.
- Anadir `agent_tasks` y `agent_findings`.
- Mantener las tools actuales, pero hacerlas profile-aware antes de abrirlas a usuarios externos.

### Fase 2: Modo personal / modo negocio

Objetivo: que el usuario pueda separar vida personal y actividad economica.

- Crear `business_entities`.
- Permitir marcar movimientos como personal, negocio o mixto.
- Crear `transaction_splits`.
- Adaptar dashboard a tabs Personal, Negocio y Consolidado.
- Crear reportes mensuales por modo.

### Fase 3: AI CFO y forecast

Objetivo: pasar de "que paso" a "que hago".

- Forecast 30/60/90.
- Preguntas conversacionales de caja, pago personal, contratacion y recorte.
- Alertas proactivas semanales.
- Plan de accion semanal generado por agente.

### Fase 4: SAT/CFDI y contabilidad mexicana

Objetivo: convertir Mexico en el wedge defensible.

- Modelar `fiscal_profiles`.
- Permitir carga manual de XML CFDI primero.
- Despues integrar Descarga Masiva SAT con consentimiento y cifrado.
- Conciliar banco vs CFDI.
- Reporte para contador.
- Detectar facturas faltantes, canceladas o no conciliadas.

### Fase 5: Portal contador/despacho

Objetivo: distribution B2B2C.

- Multi-cliente.
- Permisos owner/contador/viewer.
- Bandeja de pendientes.
- Reporte mensual por cliente.
- Pricing por despacho y cliente activo.

### Fase 6: Open banking y conectores reales

Objetivo: sustituir captura manual/email por datos confiables.

- Completar Plaid sandbox a produccion donde aplique.
- Evaluar Prometeo, Belvo y Finerio para Mexico/LatAm.
- Worker/cron de sincronizacion.
- Monitoreo de costos por proveedor.
- Clasificacion asincrona continua.

### Fase 7: Embedded finance

Objetivo: capturar upside fintech.

- Score financiero propio.
- Ofertas de credito, seguros, tarjetas, factoring o adelantos mediante partners.
- Revenue share con partners.
- Riesgo y elegibilidad explicables.

### Fase 8: Wealth cockpit e inversiones

Objetivo: convertir la app en panel completo de patrimonio e inversiones sin brincar antes de tiempo a ejecucion regulada.

- Crear modelo de datos de cuentas, activos, posiciones, transacciones y tesis.
- Integrar Binance en modo read-only y demo/testnet.
- Integrar Polymarket como market data + paper trading.
- Agregar score de salud de portafolio: concentracion, liquidez, volatilidad, horizonte y riesgo de ruina.
- Crear research fundamental + tecnico + riesgo como subagentes separados.
- Crear simulador de ordenes y paper PnL.
- Crear policy engine para bloquear sugerencias incompatibles con perfil de riesgo, deuda, impuestos o caja.

### Fase 9: Ejecucion regulada o partner-led

Objetivo: permitir invertir desde la app sin convertir el producto en una bomba regulatoria.

- Empezar con "order staging": la app prepara la orden y el usuario ejecuta en la plataforma original.
- Despues evaluar partners regulados para brokerage/crypto.
- Si se ofrece asesoria personalizada por compensacion, evaluar registro como asesor de inversiones o operar mediante entidad/partner regulado.
- Si se manejan ordenes, llaves API o custodia, exigir MFA, cifrado fuerte, permisos granulares, limites, confirmacion humana y auditoria.
- Para cada jurisdiccion, validar disponibilidad, restricciones geograficas, KYC/AML, suitability, disclosures y terminos de uso.

## Planes comerciales sugeridos

### Free

- Registro manual limitado.
- Dashboard personal basico.
- Una integracion fallback.

### Personal Pro

- IA conversacional.
- Voz/Telegram.
- Presupuesto, metas, alertas.
- Exportacion personal.

### Founder / Freelancer

- Modo negocio.
- Separacion personal/negocio.
- Forecast.
- Reporte contador.
- SAT manual/XML.

### Business

- Multiusuario.
- Open banking.
- SAT/CFDI automatizado.
- Conciliacion.
- AI CFO semanal.
- Roles y auditoria.

### Wealth / Investor

- Patrimonio neto consolidado.
- Portafolio multi-activo.
- Binance read-only.
- Polymarket research/paper.
- Research fundamental y tecnico.
- Riesgo de portafolio.
- Paper trading y bitacora de tesis.
- Alertas de rebalanceo.

### Accountant / Firm

- Multi-cliente.
- Bandeja fiscal-contable.
- Reportes por cliente.
- Alertas de discrepancias.
- Precio por cliente activo.

## Metricas de unicornio

- Activacion: usuarios que conectan al menos una fuente real y reciben primer diagnostico en menos de 10 minutos.
- Retencion: usuarios con al menos una accion financiera completada por semana.
- Profundidad: movimientos clasificados por usuario/empresa por mes.
- Expansion: conversion Personal Pro -> Freelancer -> Business -> Accountant.
- Valor: dinero ahorrado, impuestos preparados, errores detectados, flujo de caja protegido.
- Datos: porcentaje de movimientos conciliados banco-CFDI.
- Confianza: tasa de correcciones de clasificacion y falsos positivos.
- Inversiones: porcentaje de patrimonio conectado, concentracion reducida, paper PnL ajustado por riesgo, drawdown maximo y tesis cerradas con post-mortem.
- Compliance: porcentaje de acciones sensibles con confirmacion, auditoria completa y politicas aceptadas.

## Primer corte de implementacion

El siguiente sprint recomendado debe ser:

1. Crear tablas `business_entities`, `business_members`, `transaction_splits`, `agent_tasks` y `agent_findings`. Estado: listo en `20260630_agentic_business_wealth_foundation.sql`.
2. Crear el primer modelo de `investment_accounts`, `investment_positions`, `market_assets`, `investment_theses` y `paper_trades`. Estado: listo en `20260630_agentic_business_wealth_foundation.sql`.
3. Aplicar el bundle con `npm run sql:agentic-foundation` y pegarlo en Supabase SQL Editor.
4. Crear endpoints base `GET/POST /api/business/entities` y `GET/POST /api/investments/accounts`. Estado: listo.
5. Crear perfil de riesgo de inversiones con `GET/POST /api/investments/risk-profile`, `advisor_disclosures` y `risk_limits`. Estado: listo.
6. Actualizar tenant/context para resolver `profile_id` + `business_entity_id`.
7. Crear una primera vista Personal/Negocio/Consolidado.
8. Crear workflow semanal AI CFO con `POST /api/agents/weekly-cfo`, generación de `agent_tasks` y `agent_findings`. Estado: listo.
9. Hacer accionables las tareas y hallazgos con `PATCH /api/agents/tasks/[id]` y `PATCH /api/agents/findings/[id]`. Estado: listo.
10. Agregar carga manual de XML CFDI antes de automatizar SAT. Estado: listo con `20260630190922_cfdi_manual_ingest_foundation.sql` y `GET/POST /api/cfdi/documents`.
11. Separar agente actual en dos contratos: intake/clasificacion y AI CFO conversacional.
12. Crear conciliacion banco-CFDI con `cfdi_reconciliation_events` antes de automatizar SAT. Estado: listo con `POST /api/cfdi/reconcile`.
13. Integrar fuentes de mercado en modo read-only/paper antes de cualquier llave con permisos de trading. Estado: Binance y Polymarket read-only listos con `GET/POST /api/investments/market-sync`.
14. Crear agente de research de inversiones que convierta snapshots de mercado en tesis auditables. Estado: listo con `GET/POST /api/investments/research-agent`.
15. Convertir tesis en simulaciones paper con bitacora y PnL cerrado antes de habilitar ejecucion real. Estado: listo con `GET/POST /api/investments/paper-trades` y `PATCH /api/investments/paper-trades/[id]`.
16. Cerrar el loop de aprendizaje de inversiones: score historico de paper trading y post-mortem en `investment_theses.evidence.postMortem`. Estado: listo.

## Fuentes y referencias externas

- SAT: portal de factura electronica y CFDI 4.0: https://www.sat.gob.mx/portal/public/tramites/factura-electronica
- SAT: documentacion del Servicio Web de Descarga Masiva de CFDI y retenciones: https://www.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461175779527
- Plaid: https://plaid.com/
- Prometeo: https://prometeoapi.com/
- Belvo: https://belvo.com/
- Finerio Connect: https://finerioconnect.com/
- Binance API: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
- Binance Demo Mode: https://developers.binance.com/docs/binance-spot-api-docs/demo-mode/general-info
- Polymarket API overview: https://docs.polymarket.com/api-reference/introduction
- Polymarket market data: https://docs.polymarket.com/market-data/overview
- Polymarket trading overview: https://docs.polymarket.com/trading/overview
- CNBV Registro de Asesores en Inversiones: https://www.gob.mx/cnbv/acciones-y-programas/registro-de-asesores-en-inversiones-rai
- SEC Investor Bulletin on robo-advisers: https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-45
