# Control de costos sin degradar calidad

## Política de IA

- `structured`: Gemini 2.5 Flash-Lite y GPT-5 Mini como respaldo.
- `financial-agent`: GPT-5 Mini con herramientas y cifras consultadas desde Supabase.
- `dashboard-analysis`: GPT-5 Mini y Gemini 2.5 Flash-Lite.
- Los modelos premium sólo entran cuando `AI_ALLOW_PREMIUM_FALLBACK=true`.
- `openrouter/auto` se descarta para impedir selección de modelos de precio impredecible.
- El router de intención por LLM queda apagado por defecto. Las reglas deterministas protegen escrituras y el agente resuelve conversación abierta.

Cada ejecución escribe una línea JSON `[ai-usage]` con feature, proveedor, modelo, tokens, costo reportado por el proveedor, latencia y éxito. En Vercel se puede agrupar por `feature:*` y crear alertas de gasto por modelo.

## Infraestructura

- Dashboard: refresco inicial, al recuperar foco, después de mutaciones y respaldo cada cinco minutos.
- El endpoint limita movimientos bancarios al mes visible y a 200 filas; los agregados anuales conservan precisión del reporte.
- Syncfy: webhook-first. `SYNCFY_AUTOMATIC_PULLS_ENABLED=false` evita pulls pagados automáticos; la actualización manual sigue disponible.
- Sentry: errores completos, trazas normales al 1% y logs desactivados salvo activación explícita.

## Guardia de regresión

Ejecutar:

```bash
npm run cost:guard
```

La comprobación falla si reaparecen `openrouter/auto`, polling de 30/60 segundos o se elimina la migración que desprograma el pull Syncfy por minuto.

## Cambios externos pendientes de decisión humana

- Revisar Usage de Vercel, Supabase, OpenRouter/AI Gateway, Google, Syncfy y Sentry cada mes.
- Mantener un solo proyecto Supabase Micro mientras CPU, memoria y conexiones lo permitan.
- No contratar Log Drains, PITR o dominios personalizados hasta que exista un requisito operativo.
- Comparar tarjeta contra SPEI para planes anuales o B2B; no retirar Stripe Checkout ni Portal.
