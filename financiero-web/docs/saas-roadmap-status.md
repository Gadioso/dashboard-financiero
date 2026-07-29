# SaaS roadmap status

## Visión

Estado: definida.

Virafi es una plataforma B2C de finanzas personales orientada a metas. Une banca de solo lectura, planeación, VirafIA y contexto de inversión para ayudar a cada persona a convertir una meta de vida en decisiones financieras sostenibles.

La tesis completa está en [agentic-finance-platform.md](./agentic-finance-platform.md).

## Base multiusuario

Estado: implementada, sujeta a verificación continua.

- Supabase Auth y datos financieros asociados a `profile_id`.
- RLS para aislamiento entre usuarios.
- Estado de cuenta, exportación y eliminación de datos.
- Auditoría y observabilidad de errores.

## Onboarding por metas

Estado: funcional, próximo foco de producto.

- Crear cuenta y perfil.
- Definir metas financieras.
- Registrar presupuestos y movimientos.
- Conectar una fuente bancaria de solo lectura.
- Mostrar estado de configuración.

Siguiente corte: convertir la meta en el eje del onboarding y generar un primer plan con aportación, horizonte y probabilidad de cumplimiento.

## VirafIA proactiva

Estado: base implementada.

- Chat con herramientas financieras.
- Tareas y hallazgos de agentes.
- Análisis semanal y recomendaciones.
- Contexto de movimientos, ingresos, saldos, metas, patrimonio e inversiones.

Siguiente corte: priorización de una sola acción, explicación auditable y seguimiento de aceptación o rechazo.

## Banca automatizada

Estado: en progreso.

- Open banking retirado por inviabilidad económica; los movimientos se registran manualmente o por Telegram.
- Una futura conexión bancaria requiere cobertura mexicana comprobada y coste variable sin mínimo mensual alto.
- Sincronización a cuentas y transacciones crudas.
- Clasificación por lotes con backpressure inicial.
- Orígenes Banco, Telegram y Web asociados al usuario.

Siguiente corte: worker continuo, indicador de frescura, cobertura por institución y fallback de importación.

## Inversión orientada a metas

Estado: base avanzada.

- Portafolios, posiciones, perfil de riesgo y límites.
- Sincronización de mercados en modo lectura.
- Tesis de inversión auditables.
- Simulación, PnL y post-mortem.
- Confirmación humana para acciones sensibles.

Siguiente corte: conectar cada recomendación con una meta, horizonte, necesidad de liquidez y capacidad de pérdida; añadir fuentes y fecha de actualización visibles.

## Billing

Estado: base implementada.

- Stripe Checkout, Customer Portal y webhook.
- Suscripciones asociadas al perfil.
- Límites de plan y estado en el dashboard.

Pendiente: validar producto, precio, webhook y variables del entorno de producción.

## Seguridad y operación

Estado: base operativa.

- Rate limiting, RLS, escaneo de secretos y eventos de auditoría.
- Exportación y borrado por usuario.
- Alertas operativas persistidas en Supabase y logs de Railway.
- Procedimiento de restore en staging.

Siguiente corte: pruebas sobre consentimiento bancario, recomendaciones de inversión, acciones confirmadas y aislamiento entre usuarios.

## Métricas del siguiente lanzamiento

- Tiempo hasta el primer plan útil.
- Activación: meta creada más fuente financiera conectada.
- Retención semanal y mensual.
- Metas con aportación activa.
- Recomendaciones aceptadas y beneficio observado.
- Frescura y tasa de error de conexiones.
- Costo de IA y proveedores por usuario activo.
