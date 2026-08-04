# Auditoría de correcciones — 4 de agosto de 2026

## Propósito y alcance

Este documento convierte el QA integral y la revisión estática del repositorio en un backlog de correcciones. Cubre la aplicación Next.js en `financiero-web`: backend/API, flujos financieros, seguridad, frontend, UI/UX, accesibilidad y operación.

La clasificación significa:

- **P0**: detener despliegue o desactivar el flujo hasta corregirlo.
- **P1**: corregir antes de ampliar usuarios o exponer el flujo de forma general.
- **P2**: corregir en el siguiente ciclo de producto.
- **P3**: mejora planificable; no bloquea por sí misma.

No hubo cambios de producto durante esta auditoría. El árbol de trabajo ya contenía cambios locales, que no forman parte de este reporte.

## Resumen ejecutivo

No se observó exposición anónima de datos: en producción, `/dashboard` redirige al login y `/api/dashboard` anónimo devuelve `401`. Las pruebas unitarias existentes, lint y build pasan.

El principal problema es de **integridad financiera**: varias entradas de IA y de mensajería escriben movimientos directamente tras interpretar texto o archivos, sin una confirmación determinista del usuario. Esto contradice el límite arquitectónico del proyecto y también contradice la promesa de la interfaz de importación.

Prioridad de corrección:

1. Hacer obligatoria una confirmación determinista para toda escritura financiera asistida por IA, adjuntos y mensajería.
2. Proteger endpoints de alto costo/alto impacto con rate limit distribuido y cuotas por perfil.
3. Resolver el overflow del dashboard a 1280 px y los fallos de accesibilidad de modales.
4. Completar pruebas de rutas, E2E y observabilidad antes de crecer el uso real.

## Hallazgos que requieren corrección

### P1 — Escrituras financieras automáticas desde IA y chat

**Impacto.** Un mensaje interpretado erróneamente por Gemini puede crear ingresos, gastos o abonos de tarjeta de forma irreversible desde el flujo web, Telegram o el endpoint legado. La deduplicación no sustituye el consentimiento: evita repeticiones, pero no valida que el movimiento inferido sea correcto.

**Evidencia.**

- [`app/api/dashboard/chat/route.ts`](../app/api/dashboard/chat/route.ts) inserta directamente en `gastos`, `ingresos` y `abonos_tarjeta_credito` tras clasificar texto o adjuntos (por ejemplo, líneas 258–259 y 300–490).
- [`app/api/procesar-gasto/route.ts`](../app/api/procesar-gasto/route.ts) clasifica `texto` y lo inserta sin confirmación (líneas 10–115).
- [`app/api/telegram/webhook/route.ts`](../app/api/telegram/webhook/route.ts) inserta movimientos derivados de mensajes/archivos (líneas 670–672, 810 y 875).

**Corrección requerida.**

1. Sustituir cada inserción asistida por un `draft` persistido, con `profile_id`, origen, payload normalizado, versión del clasificador, caducidad y hash de idempotencia.
2. Responder con una vista/resumen de confirmación explícita: concepto, tipo, fecha, monto, categoría y efecto contable.
3. Añadir un endpoint de confirmación que acepte únicamente el `draft_id` y una decisión explícita; revalidar el payload en el servidor y aplicar idempotencia/estado transaccional.
4. Para Telegram, usar botones de confirmar/descartar o un código de confirmación de un solo uso; para chat web, una tarjeta de confirmación no ambigua. No aceptar frases libres como prueba de consentimiento.
5. Mantener los abonos de tarjeta en su flujo dedicado, pero también bajo confirmación antes de insertar.
6. Retirar o proteger el endpoint legado `/api/procesar-gasto` mientras migra al mismo contrato.

**Criterios de aceptación.** Ninguna ruta cuyo dato provenga de LLM, audio, imagen, PDF, chat o webhook inserta, actualiza o borra un movimiento sin una confirmación de servidor ligada al perfil y consumible una sola vez.

### P1 — El chat con adjuntos evita la revisión/confirmación de importación

**Impacto.** El modal de importación promete que “ningún movimiento se guarda sin tu confirmación”, pero enviar un archivo al chat puede extraer e insertar hasta 120 movimientos inmediatamente. Es una incoherencia de producto que puede producir registros incorrectos y pérdida de confianza.

**Evidencia.** [`FinancialImportModal.tsx`](../app/Components/FinancialImportModal.tsx) muestra el mensaje de confirmación (línea 159), mientras que [`dashboard/chat/route.ts`](../app/api/dashboard/chat/route.ts) crea las filas extraídas de adjuntos (líneas 226–275) sin pasar por `/api/imports/financial/[id]/confirm`.

**Corrección requerida.** Enviar todos los adjuntos financieros al mismo pipeline de lotes de importación; mostrar previsualización editable, alertas de deduplicación y un botón de confirmación. El chat debe responder con un enlace/CTA al borrador, no con “registré”.

### P1 — Rate limiting no protege IA, cargas ni operaciones financieras y no escala en Railway

**Impacto.** Los endpoints de autenticación usan un `Map` de memoria por proceso, pero las rutas que invocan Gemini, reciben adjuntos, transcriben audio o crean movimientos no tienen límite. En contenedores y múltiples réplicas, el `Map` no comparte estado; además, `x-forwarded-for` se toma sin una frontera de proxy confiable. Esto permite consumo inesperado de Gemini, denegación de servicio y abuso autenticado.

**Evidencia.**

- [`lib/rate-limit.ts`](../lib/rate-limit.ts) implementa un `Map` local y toma la primera IP de `x-forwarded-for` (líneas 1–39).
- El helper se usa sólo en login, registro y recuperación; no está presente en `dashboard/chat`, `audio/transcribe`, `imports/financial`, `dashboard/analysis`, Telegram ni las rutas de inversión.

**Corrección requerida.**

1. Reemplazar el `Map` por un limitador distribuido compatible con Railway y almacenar contadores/ventanas por `profile_id`, IP confiable y endpoint.
2. Definir presupuestos diferenciados: autenticación, IA de texto, adjuntos, audio, importación, análisis, sincronización de mercado y webhooks.
3. Usar la IP que entregue Railway mediante una configuración de proxy confiable; no confiar ciegamente en una cabecera enviada por el cliente.
4. Responder `429` con `Retry-After`, registrar el evento y añadir métricas de rechazo/costo.

### P2 — Dependencia vulnerable: Next.js/PostCSS

**Impacto.** `npm audit --omit=dev --json` reporta dos vulnerabilidades moderadas, una transitiva de PostCSS que afecta la versión instalada de Next.js. No hay vulnerabilidades altas o críticas en dependencias de producción en este chequeo.

**Evidencia.** El audit reporta `next` afectado por `postcss <= 8.5.22` (GHSA-fxqj-rqcc-2cmp) y ofrece corrección disponible.

**Corrección requerida.** Actualizar Next.js a una versión estable que resuelva la cadena de PostCSS, regenerar `package-lock.json`, ejecutar `npm audit --omit=dev`, pruebas, lint y build. Revisar las notas de la versión instalada de Next.js antes del cambio.

### P2 — Dashboard con overflow horizontal a 1280 px

**Impacto.** A 1280×720 el dashboard tiene 80 px de scroll horizontal (`scrollWidth=1360`, `clientWidth=1280`). La tarjeta “Presupuesto por categoría” rebasa el borde derecho. El defecto degrada una resolución de escritorio común y puede ocultar acciones.

**Evidencia.** La captura de auditoría y la evaluación DOM actual confirman el desbordamiento. La grilla en [`DashboardFinanciero.tsx`](../app/Components/DashboardFinanciero.tsx#L2902) activa en `xl` mínimos de 270 + 420 + 350 px, sin considerar el sidebar ni los gaps. No se reprodujo a 1279, 1366, 1440 o 390 px.

**Corrección requerida.** Cambiar el breakpoint o la estrategia de grilla: permitir dos columnas en el intervalo 1280–1365, reducir mínimos de forma segura, o usar `minmax(0, ...)` y componentes que puedan contraerse. Añadir una prueba visual por breakpoint para 1280, 1366 y móvil.

### P2 — Modales sin gestión completa de foco ni salida por teclado

**Impacto.** Los modales exponen `role="dialog"` y `aria-modal`, pero el código no implementa trampa de foco, retorno de foco al disparador ni cierre con Escape. Una persona que navega con teclado puede salir del modal visualmente activo o perder la posición al cerrarlo.

**Evidencia.**

- [`FinancialImportModal.tsx`](../app/Components/FinancialImportModal.tsx#L153) declara el diálogo sin lógica de foco o `onKeyDown`.
- [`DashboardFinanciero.tsx`](../app/Components/DashboardFinanciero.tsx#L2692) y los modales de metas en líneas 3271 y 3281 siguen el mismo patrón.

**Corrección requerida.** Extraer un componente de diálogo accesible que al abrir enfoque el primer control útil, mantenga el foco dentro, cierre con Escape cuando sea seguro, restaure el foco al activador y preserve el bloqueo de scroll. Añadir pruebas de teclado y lector de pantalla.

### P2 — Formularios de previsualización de importación sin etiquetas asociadas

**Impacto.** Los campos de fecha, concepto, tipo, categoría, subcategoría y monto dentro de la tabla dependen sólo de encabezados visuales. Un lector de pantalla no recibe una etiqueta de campo clara y el usuario no puede identificar con certeza qué modifica.

**Evidencia.** [`FinancialImportModal.tsx`](../app/Components/FinancialImportModal.tsx#L225) renderiza `input` y `select` sin `label`, `aria-label` ni `aria-labelledby`; sólo el checkbox tiene `aria-label`.

**Corrección requerida.** Asociar cada control con el encabezado y el número de fila mediante `aria-labelledby` o `aria-label` explícito (por ejemplo, “Monto, fila 12”), y anunciar errores por fila con `aria-describedby`/`aria-live`.

### P2 — Componente de dashboard demasiado concentrado

**Impacto.** [`DashboardFinanciero.tsx`](../app/Components/DashboardFinanciero.tsx) tiene 4,363 líneas y contiene estado, fetches, reglas de negocio, modales, formularios, navegación, gráficos y varias experiencias de producto. Aumenta el riesgo de regresiones, dificulta la revisión de seguridad y hace costoso probar cambios pequeños.

**Evidencia.** Inventario de código de esta auditoría: es con diferencia el archivo de UI más grande; el siguiente bloque principal es `conversation-agent.ts` con 1,542 líneas.

**Corrección requerida.** Separar por dominio y contrato: `DashboardShell`, navegación, resumen, movimientos, presupuestos, metas, wealth, reportes, chat y modales. Extraer hooks de datos por endpoint y tipos compartidos; dejar en el componente raíz sólo composición y estado de vista. Hacer la migración incremental con pruebas de regresión por sección.

### P2 — Pruebas insuficientes para rutas y flujos críticos

**Impacto.** Las 25 pruebas pasan, pero sólo hay nueve archivos de prueba unitarios y no existe configuración ni suite E2E en el inventario. Esto deja sin cobertura verificable la autenticación, autorización por perfil, confirmación/borrado, importación real, Stripe, webhooks, modales y rutas de IA.

**Evidencia.** `tests/` contiene pruebas de librerías; no hay `playwright.config.*`, `cypress` ni pruebas de rutas API. El QA manual sí cubrió rutas públicas, navegación básica, idioma y móvil.

**Corrección requerida.**

1. Pruebas de integración por ruta con Supabase/Gemini/Stripe simulados y perfiles A/B para demostrar aislamiento.
2. E2E de: alta/login/recuperación, redirección protegida, movimiento manual, borrador IA→confirmar/descartar, importación→editar→confirmar, abono de tarjeta, eliminación de cuenta, Stripe/webhook y flujos Telegram.
3. Pruebas de accesibilidad automatizadas y prueba manual de teclado en diálogos.
4. Matriz visual de breakpoints 390, 768, 1024, 1280, 1366 y 1440 px.

### P2 — Observabilidad insuficiente para una aplicación financiera y de IA

**Impacto.** Hay auditoría de eventos y registro de errores en base de datos, pero no se encontró instrumentación de trazas, métricas de latencia/costo ni alertas para la experiencia web. Incidentes de Gemini, Supabase, Stripe o un aumento de errores pueden detectarse tarde.

**Evidencia.** La búsqueda de `Sentry`, OpenTelemetry, web vitals, métricas o trazas no devolvió instrumentación de aplicación; el proyecto sí contiene `operational-events.ts` y una ruta de alertas operativas.

**Corrección requerida.** Instrumentar duración, resultado, costo/tokens y rate-limit de cada proveedor; crear alertas sobre tasa de error, latencia, colas de importación, confirmaciones fallidas y discrepancias contables. Evitar registrar texto completo, adjuntos o secretos en telemetría.

### P3 — Endurecer cabeceras de seguridad con CSP

**Impacto.** Se configuran `X-Frame-Options`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`, pero no una Content Security Policy. Una CSP bien probada reduce la superficie de XSS y carga de recursos inesperados.

**Evidencia.** [`next.config.ts`](../next.config.ts#L7) define las cabeceras actuales; no define `Content-Security-Policy`.

**Corrección requerida.** Diseñar una CSP compatible con Next.js y las integraciones necesarias, empezar con `Report-Only`, corregir violaciones y aplicar una política exigente. No añadir `unsafe-inline` o dominios amplios sin justificación.

### P3 — Revisión de RLS, Storage y Cron como puerta de lanzamiento

**Impacto.** Las rutas de servidor usan el service role y filtran por `profile_id`, pero esta auditoría no tuvo acceso al proyecto Supabase desplegado. No puede certificar políticas RLS, buckets, funciones ni cron reales.

**Corrección requerida.** Antes de lanzamiento, contrastar migraciones con la instancia desplegada y demostrar con pruebas que: RLS bloquea lectura/escritura cruzada, Storage sólo permite el prefijo del perfil, webhooks/Cron verifican secretos, y las operaciones de borrado/exportación no salen del `profile_id` validado.

## Trabajo de UX y producto que debe acompañar las correcciones

1. **Confirmación financiera clara.** Mostrar el efecto esperado antes de guardar: “Se registrará un gasto de $X en Y el día Z; esto reduce el saldo disponible de …”. Distinguir visualmente gasto, ingreso y abono de tarjeta.
2. **Estados de error y recuperación.** Para Gemini, Storage, Supabase y Stripe, ofrecer mensajes accionables, reintento seguro e idempotencia; nunca dejar un botón ambiguo después de un fallo parcial.
3. **Importación revisable en móvil.** La tabla de 1180 px es aceptable sólo si el desplazamiento horizontal está anunciado y es utilizable por teclado. Para móvil, valorar tarjetas por fila o una edición secuencial para reducir desplazamiento lateral.
4. **Datos vacíos útiles.** El dashboard vacío está visualmente claro, pero debe llevar a la primera acción con una CTA única y priorizada; evitar competir entre “Agregar movimiento”, chat, metas y asesoría en el mismo primer estado.
5. **Mensajes de IA no confirmados.** Todo resultado generado debe distinguir “propuesta” de “registro confirmado”; las acciones de confirmar/descartar deben ser visibles y accesibles.

## Plan de ejecución sugerido

### Fase 1 — Bloqueo de integridad y abuso

- Implementar el contrato de borradores y confirmación única para todas las escrituras asistidas.
- Migrar chat web, Telegram y `/api/procesar-gasto`; desactivar temporalmente el último si no se migra.
- Instalar rate limiting distribuido, cuotas por perfil y eventos de costo.
- Añadir integración de ruta para aislamiento de perfil, confirmación única e idempotencia.

### Fase 2 — Correcciones de interfaz y accesibilidad

- Corregir la grilla de 1280 px y crear capturas/regresiones por breakpoint.
- Reemplazar modales por un diálogo accesible reutilizable.
- Etiquetar la tabla de importación y validar con teclado/lector de pantalla.
- Separar el dashboard por módulos sin cambiar contratos públicos.

### Fase 3 — Confiabilidad y lanzamiento

- Actualizar Next.js/PostCSS y volver a ejecutar la suite completa.
- Agregar E2E, pruebas de rutas, pruebas visuales y escaneo de dependencias a CI.
- Incorporar trazas/métricas/alertas con una política de privacidad de logs.
- Realizar revisión de Supabase (RLS, Storage, Cron) contra la instancia real y aplicar CSP en modo report-only.

## Verificaciones realizadas

| Verificación | Resultado |
| --- | --- |
| `npm test` | Pasa: 25/25 |
| `npm run lint` | Pasa |
| `npm run build` | Pasa; compilación, TypeScript y 32 rutas estáticas |
| QA de rutas públicas, login, onboarding y dashboard | Carga correcta; sin errores/warnings relevantes de consola |
| Idioma ES↔EN, menú móvil y navegación móvil de dashboard | Pasa |
| Auth en producción | `/dashboard` sin sesión: redirección 307 a login; `/api/dashboard` anónimo: 401 |
| `npm audit --omit=dev` | 2 vulnerabilidades moderadas (`next`/`postcss`) |

## Límites de esta auditoría

- No se ejecutaron pagos Stripe, importaciones con archivos reales, borrados, ni operaciones financieras que alteren datos del usuario.
- No se inspeccionó la configuración desplegada de Supabase, Railway, Stripe, Gemini, Telegram o Meta; por ello las revisiones de RLS, Storage, Cron y secretos son requisitos de verificación, no certificaciones.
- La auditoría visual cubrió el dashboard con sesión existente y rutas públicas en escritorio/móvil. No constituye una certificación completa WCAG ni una prueba en todos los navegadores.
