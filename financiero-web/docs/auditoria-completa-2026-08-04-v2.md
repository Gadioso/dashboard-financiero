# Auditoría completa v2 — 4 de agosto de 2026

## Alcance y criterio

Auditoría independiente, de solo lectura, sobre la aplicación web de Virafi: interfaz pública, flujos de acceso, API y migraciones, integridad de datos, pruebas y viabilidad Android. No se modificó código de producto ni datos. La revisión sigue la frontera del proyecto: toda escritura financiera derivada de IA debe requerir confirmación determinista y todo acceso privilegiado debe quedar acotado por `profile_id` validado.

## Evidencia verificada

| Superficie | Resultado | Evidencia |
| --- | --- | --- |
| Pruebas unitarias | Correcto | `npm test`: 25/25 pruebas aprobadas. |
| Lint | Correcto | `npm run lint` terminó sin errores. |
| Build de producción | Correcto | `npm run build` terminó correctamente con Next.js 16.2.12. |
| Navegación pública | Parcial | Inicio, menú móvil y acceso cargaron en `http://localhost:3000` sin errores ni warnings de consola de la aplicación. |
| Datos reales 2026 | Parcial | Auditoría de solo lectura: 39 ingresos, 124 gastos, 2 abonos y 15 presupuestos. No hubo ingresos/abonos sospechosos ni presupuestos desfasados según el script; el resultado de duplicados no es confiable por el defecto DQ-1. |
| Diseño contra referencia | Bloqueado | Las únicas referencias vigentes en `docs/design/` describen el producto anterior (“Tu dinero, con claridad y rumbo” y un dashboard patrimonial), mientras la implementación actual comunica un CFO personal. No son el mismo estado ni el mismo producto. |
| Android | No aplicable | El repositorio no contiene proyecto Android, APK/AAB, Gradle ni `adb`; no existe artefacto ejecutable para una auditoría de emulador. |

Capturas transitorias de esta pasada: escritorio de inicio, móvil de inicio, menú móvil abierto y acceso, todas en `/tmp/virafi-audit-v2-*.png`. Viewports: 1280 × 720 de escritorio y 390 × 844 CSS px móvil, densidad 1.

## Hallazgos que requieren corrección

### P0 — La IA registra movimientos sin confirmación explícita

**Evidencia.** El chat web extrae adjuntos y ejecuta inserciones en `gastos` e `ingresos` directamente en [`app/api/dashboard/chat/route.ts`](../app/api/dashboard/chat/route.ts#L230) y también inserta gastos múltiples o movimientos clasificados por Gemini en las líneas 336–445. El webhook de Telegram repite el patrón para adjuntos, gastos múltiples, abonos y movimientos individuales en [`app/api/telegram/webhook/route.ts`](../app/api/telegram/webhook/route.ts#L636) y siguientes.

**Impacto.** Una interpretación incorrecta de texto, voz, imagen o PDF altera el libro financiero antes de que la persona pueda revisar importe, fecha, categoría o tipo. La deduplicación no equivale a consentimiento.

**Corrección.** Unificar todos los canales (chat, voz, adjuntos y Telegram) en un lote de previsualización: filas editables, resumen, token/idempotencia y endpoint de confirmación explícita. Hasta confirmar, no escribir en tablas financieras ni recalcular presupuestos. Añadir pruebas de “cero escrituras antes de confirmar” por cada canal.

### P1 — El consumo de créditos de IA no es atómico

**Evidencia.** [`lib/ai-credits.ts`](../lib/ai-credits.ts#L27) hace `select → seed mensual → suma → insert de débito` en llamadas separadas. La migración [`20260731000200_billing_ai_credits.sql`](../supabase/migrations/20260731000200_billing_ai_credits.sql#L2) no impone unicidad de allowance mensual por `(profile_id, source, period_start)` ni contiene una operación transaccional para descontar saldo.

**Impacto.** Dos solicitudes concurrentes pueden crear dos allowances mensuales o gastar el mismo saldo dos veces.

**Corrección.** Crear una RPC SQL transaccional que bloquee la fila/perfil, garantice un único allowance mensual y haga el débito condicionado al saldo. Añadir índice único parcial y prueba de concurrencia.

### P1 — El borrado de cuenta puede dejar archivos privados y estados parciales

**Evidencia.** [`app/api/account/data/route.ts`](../app/api/account/data/route.ts#L93) lista sólo el primer nivel de Storage y elimina `profileId/<folder>`, aunque las importaciones se almacenan anidadas por lote. Después borra Storage, tablas y `auth.users` en pasos independientes (líneas 143–173), sin transacción ni compensación.

**Impacto.** Una eliminación puede reportar éxito parcial, dejar documentos financieros privados accesibles en Storage o borrar datos de negocio sin borrar el usuario.

**Corrección.** Listar y eliminar recursiva y paginadamente, validar cada error y hacer la limpieza de datos mediante una RPC transaccional/cascadas verificadas. Revocar sesiones antes de eliminar el usuario de Auth y probar fallo intermedio/reintento.

### P1 — Confirmar una importación no es transaccional ni reanudable

**Evidencia.** [`app/api/imports/financial/[id]/confirm/route.ts`](../app/api/imports/financial/[id]/confirm/route.ts#L132) inserta gastos, cambia filas, inserta ingresos, sincroniza presupuestos y confirma el lote con solicitudes separadas. Ante error devuelve el lote a `preview` (líneas 196–200), aun si ya insertó parte de los movimientos.

**Impacto.** Un reintento puede presentar filas/lote con estado incorrecto o dejar contabilidad parcialmente aplicada. Los fingerprints reducen duplicados, pero no restauran consistencia de estado y presupuesto.

**Corrección.** Mover confirmación, filas y escrituras financieras a una RPC transaccional idempotente. Si no se migra de inmediato, conservar estados `processing`/`failed` y reconciliar por `batch_id` antes de permitir reintento.

### P1 / DQ-1 — El auditor de datos mezcla perfiles y puede producir falsos duplicados

**Evidencia.** [`scripts/data-audit.mjs`](../scripts/data-audit.mjs#L173) consulta `gastos` y `abonos_tarjeta_credito` sin seleccionar ni filtrar `profile_id`; luego `summarizeMonth` suma esas filas globales junto con ingresos/presupuestos por perfil. `groupDuplicates` tampoco separa por perfil. La corrida real informó un grupo de gastos duplicados, pero ese indicador puede comparar a dos personas distintas.

**Impacto.** El reporte local puede atribuir gastos, totales mensuales y duplicados de un perfil a otro; no sirve para decidir borrados y vulnera el principio de aislamiento analítico.

**Corrección.** Seleccionar siempre `profile_id`, agrupar por `(profile_id, fecha, concepto, monto, tipo)` y emitir resultados agregados por perfil sin conceptos ni identificadores. Ejecutar la limpieza sólo después de una revisión humana de duplicados del mismo perfil.

### P2 — Hay carrera al crear presupuestos mensuales

**Evidencia.** [`lib/budget-sync.ts`](../lib/budget-sync.ts#L44) y [`app/api/account/onboarding/route.ts`](../app/api/account/onboarding/route.ts#L91) hacen lectura seguida de inserción. La migración [`20260608000100_multi_user_foundation.sql`](../supabase/migrations/20260608000100_multi_user_foundation.sql#L58) sólo crea un índice no único para `(profile_id, mes_anio)`.

**Impacto.** Dos solicitudes simultáneas pueden crear presupuestos duplicados y hacer fallar posteriores `maybeSingle()`.

**Corrección.** Añadir restricción `unique(profile_id, mes_anio)` y usar `upsert` o una RPC transaccional; cubrir con prueba concurrente.

### P2 — Telegram acepta adjuntos sin los límites equivalentes a web

**Evidencia.** [`app/api/telegram/webhook/route.ts`](../app/api/telegram/webhook/route.ts#L636) envía adjuntos a extracción sin reutilizar `validateFinancialAttachments`; el descriptor Telegram expone tamaño, pero no se valida antes de descargar/procesar.

**Impacto.** Un chat autorizado puede forzar descargas grandes, Base64 grande, consumo de memoria y gasto de Gemini.

**Corrección.** Compartir el validador web: tipo permitido, máximo de archivos y límites de 10/40 MB antes de descargar; rechazar por `file_size` y registrar el rechazo sin contenido sensible.

### P2 — Internacionalización incoherente en inicio y acceso

**Evidencia.** En la captura móvil del inicio en inglés quedó el texto español “$2,750 al mes”. En la pantalla de acceso, el selector y títulos cambian a inglés, pero permanecen el gran titular, descripción y pestaña de respaldo en español; el DOM y la imagen muestran el mismo estado.

**Impacto.** Reduce confianza en una aplicación financiera y dificulta comprensión a usuarios de inglés.

**Corrección.** Completar las claves del contenido estático y evitar fallback por fragmentos. Probar visualmente ambos locales, incluido estado inicial/hidratación y todas las pestañas de acceso.

### P2 — El disparador del menú móvil no tiene semántica de botón

**Evidencia.** En 390 px el árbol accesible expone “Open navigation”/“Abrir navegación” como `generic`, no como `button`; aun así se pudo abrir mediante coordenadas y aparecen los enlaces del menú.

**Impacto.** Lectores de pantalla y navegación por teclado no reciben correctamente rol, estado expandido ni relación con el menú.

**Corrección.** Usar un `<button>` nativo con `aria-expanded`, `aria-controls`, foco visible y prueba de teclado (`Enter`, `Space`, `Escape`).

### P2 — Cobertura insuficiente de las rutas de mayor riesgo

**Evidencia.** Las 25 pruebas actuales pasan, pero no cubren rutas de chat/Telegram, confirmación de importación, borrado de cuenta, RLS real ni condiciones de carrera de créditos/presupuesto.

**Impacto.** Los flujos de dinero con mayor impacto quedan protegidos sólo por pruebas de utilidades y verificación manual.

**Corrección.** Añadir pruebas de rutas e integración con Supabase aislado/mock: aislamiento entre tenants, no-write-before-confirm, rollback/retry del lote, Storage anidado, límites de Telegram y concurrencia.

### P3 — Falta una referencia de diseño actual para QA de fidelidad

**Evidencia.** La imagen [virafi-site-concept-top.png](../docs/design/virafi-site-concept-top.png) (932 × 1688) representa el producto anterior, no la página actual de CFO. El `design-qa.md` existente declara aprobada otra dirección visual, por lo que ya no es evidencia válida de esta implementación.

**Impacto.** No es posible aprobar fidelidad visual objetiva: no hay un target del mismo producto/estado/viewport.

**Corrección.** Publicar el diseño vigente en Figma o una captura aprobada para escritorio y móvil, con contenido/locale/estado definidos; después rehacer comparación side-by-side y actualizar `design-qa.md`.

## Limitaciones explícitas

- El origen Santander no fue legible por la auditoría: `santanderLogs: 0` del reporte es un valor de respaldo; `santanderUnavailable: true` significa que no se puede inferir que no existan logs, errores ni notificaciones pendientes.
- No se probaron flujos autenticados, pagos Stripe, OAuth ni escritura real: hacerlo requeriría cuentas y datos de prueba aislados.
- La auditoría Android está bloqueada por ausencia de artefacto Android, no por un resultado de emulador.

## Orden recomendado de corrección

1. Eliminar escrituras IA previas a confirmación de todos los canales (P0).
2. Hacer transaccionales importaciones, créditos y borrado de cuenta (P1).
3. Corregir el grano por perfil del auditor de datos antes de actuar sobre su duplicado (P1/DQ-1).
4. Añadir unicidad/upsert de presupuestos, límites Telegram y las pruebas de regresión (P2).
5. Completar localización y accesibilidad móvil; definir la referencia de diseño vigente (P2/P3).
