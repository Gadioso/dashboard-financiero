# Auditoría de correcciones — 2026-08-04

## Alcance y evidencia

- Repositorio revisado: `financiero-web` (Next.js 16 / TypeScript / Supabase).
- Web capturada contra `http://localhost:3000/`: inicio desktop (1280 × 720), inicio móvil (390 × 844), menú móvil y acceso móvil (390 × 844). Evidencia temporal: `/tmp/virafi-audit-home-desktop.png`, `/tmp/virafi-audit-home-mobile.png`, `/tmp/virafi-audit-mobile-menu.png`, `/tmp/virafi-audit-login-mobile.png`.
- Referencias visuales localizadas: `docs/design/virafi-site-concept-top.png` (932 × 1688) y `docs/design/virafi-site-concept-bottom.png` (1536 × 1024). No representan el mismo viewport/estado que las capturas actuales, por lo que no se debe declarar fidelidad visual aprobada.
- No hay artefacto Android (`build.gradle`, `gradlew`, APK/AAB) ni `adb` instalado; la QA de emulador Android no aplica y no se ejecutó.
- El dashboard autenticado no se ejerció: no se usaron ni solicitaron credenciales ni datos financieros reales.
- Calidad ejecutada: `npm test` (25/25), `npm run lint` y `npm run build` pasaron. Esto no sustituye pruebas E2E, de RLS ni de datos reales.

## Hallazgos que bloquean lanzamiento

### [P0][Backend] El chat registra movimientos extraídos por IA sin confirmación determinista

**Ubicación:** `app/api/dashboard/chat/route.ts:230-265`.

**Evidencia:** al existir adjuntos, se extraen movimientos con Gemini, se construyen filas y se hace `insert` directo a `gastos` e `ingresos`; la respuesta confirma después que ya los registró. La extracción permite hasta 120 movimientos (`lib/financial-attachment-analysis.ts:90-110`).

**Impacto:** una interpretación errónea, ambigua o manipulada de un documento puede alterar el libro financiero y los presupuestos sin que la persona vea y apruebe los importes, fechas y categorías. Contradice la regla de arquitectura de que toda escritura financiera debe quedar detrás de confirmación determinista.

**Corrección:** cambiar el primer POST a análisis/preview solamente. Persistir un lote `pending_confirmation` con filas normalizadas, devolverlo al modal/chat y crear una segunda ruta de confirmación que reciba sólo IDs ya guardados, valide que pertenecen al `profile_id`, deduzca duplicados de nuevo y escriba en una transacción/flujo idempotente. Añadir pruebas para: extracción errónea, reintento, doble clic, lote ajeno y cero inserciones antes de confirmar.

## Alta prioridad

### [P1][Frontend/UI] Localización imperativa rompe la consistencia y deja contenido mixto

**Ubicación:** `app/Components/LocaleProvider.tsx:12-64`, `:72-100`; contenido no localizado en `app/Components/MarketingShell.tsx:6-69` y `app/page.tsx`.

**Evidencia:** la captura móvil inicial se mostró en español, pero al abrir el menú la misma pantalla quedó en inglés mientras el control y partes del DOM no seguían un único origen. El proveedor recorre y muta nodos de texto/atributos fuera de React mediante `TreeWalker` y `MutationObserver`; además usa un diccionario de sustitución genérica sobre HTML que sigue conteniendo cadenas españolas. Hay incluso texto localizado parcialmente: `Suggested amount: $2,750 al mes`.

**Impacto:** la experiencia cambia después de cargar o interactuar, el lector de pantalla puede anunciar una lengua distinta de `html[lang]`, y cualquier texto nuevo queda sin traducir o traducido de forma frágil.

**Corrección:** eliminar `useDocumentLocalization` y toda mutación DOM. Pasar cada cadena por `t()`/catálogos tipados en el render, incluyendo navegación, footer, marketing y dashboard. Resolver el locale del servidor desde cookie/perfil antes del primer render (o mostrar una pantalla neutra hasta cargarlo) y no recargar la página en `setLocale`. Añadir pruebas de español/inglés que aseguren que no queda texto del otro idioma y una prueba E2E de cambiar idioma y abrir el menú.

### [P1][Backend] Cargas del chat se materializan antes de aplicar límites y no hay control de coste/abuso en los endpoints de IA

**Ubicación:** `app/api/dashboard/chat/route.ts:78-109, 207-221`; `lib/financial-attachment-analysis.ts:4-41, 96-99, 139-146`; `app/api/procesar-gasto/route.ts:13-36`.

**Evidencia:** `request.formData()` se ejecuta antes de `validateFinancialAttachments`; después se convierten hasta 40 MB a Base64 y se envían a Gemini, potencialmente dos veces (análisis y extracción). No hay referencia a rate limit ni a `consumeAiCredit` en estos handlers.

**Impacto:** un usuario autenticado puede provocar picos de memoria, latencia y coste de Gemini; el límite de bytes llega tarde para proteger el proceso.

**Corrección:** rechazar `Content-Length` excesivo antes de leer el cuerpo, configurar un límite de body en la capa de despliegue/runtime, reducir el total aceptado para chat, procesar una única representación por archivo, y aplicar rate limit + reserva/consumo atómico de créditos por perfil antes de llamar al modelo. Registrar tamaño, número de archivos y coste, sin nombres ni contenido sensible.

### [P1][Backend] Borrado de cuenta no es transaccional y puede dejar datos o credenciales incoherentes

**Ubicación:** `app/api/account/data/route.ts:93-172`.

**Evidencia:** borra Storage y luego decenas de tablas en serie; después borra `profiles` y opcionalmente `auth.users`. Cualquier error intermedio corta el proceso; Storage no participa en una transacción y los errores de list/remove se silencian.

**Impacto:** una persona puede recibir un resultado de error tras perder parte de sus datos, o quedar con un usuario de Auth sin perfil/datos. Es especialmente sensible por tratarse de ejercicio de derechos y destrucción de información financiera.

**Corrección:** diseñar una eliminación por etapas con estado durable (`requested → processing → completed/failed`), FKs/cascadas revisadas y una función SQL transaccional para la base. Ejecutar Storage como trabajo idempotente/compensable, sólo eliminar `auth.users` al finalizar la base, y devolver el ID/estado de la solicitud. Cubrir fallos por tabla, por Storage y reintentos.

## Prioridad media

### [P2][UI/Accesibilidad] El menú móvil no comunica estado expandido y usa un control nativo poco expresivo

**Ubicación:** `app/Components/MarketingShell.tsx:29-35`; `app/globals.css:140-142`.

**Evidencia:** la captura de menú muestra el panel sobre el hero. El árbol accesible expone el disparador como genérico `Open navigation`; no hay nombre de acción que cambie a “Cerrar navegación” ni `aria-expanded` explícito.

**Impacto:** navegación menos clara para lector de pantalla/teclado; el foco y cierre al navegar no están cubiertos por prueba.

**Corrección:** sustituir `details/summary` por botón con `aria-expanded`, `aria-controls`, texto dinámico y Escape/cierre al activar enlace; conservar foco visible y añadir prueba de teclado móvil.

### [P2][UI] Edición destructiva usa `window.confirm` y edición inline se guarda en `onBlur`

**Ubicación:** `app/Components/DashboardFinanciero.tsx:1434-1485, 4098-4109, 4177-4194`.

**Evidencia:** eliminar gasto/ingreso depende del diálogo nativo; varios campos financieros guardan automáticamente al perder foco.

**Impacto:** es fácil confirmar o disparar un guardado accidental al tocar fuera, sin resumen de cambio, reversión, historial visible ni confirmación coherente con el resto de la UI.

**Corrección:** usar un diálogo accesible propio que detalle concepto, monto y efecto; para edición inline separar “Editar” de “Guardar/Cancelar”, validar antes de enviar y ofrecer undo o restauración desde historial/auditoría.

### [P2][Backend] Validación de tipo de imagen basada en MIME declarado por el cliente

**Ubicación:** `app/api/account/profile/route.ts:68-80`.

**Evidencia:** se acepta JPG/PNG/WebP por `avatar.type` y se suben los bytes tal cual con ese `contentType`; no hay comprobación de firma, decodificación, dimensiones ni recomprensión.

**Impacto:** se pueden almacenar archivos que no son la imagen que dicen ser o imágenes desproporcionadas/hostiles a consumidores posteriores.

**Corrección:** verificar magic bytes y decodificar con una librería de imagen del servidor; rechazar dimensiones/píxeles excesivos, recomprimir a formato seguro y remover el archivo previo sólo después de que la nueva carga y la actualización de perfil terminen correctamente.

### [P2][Backend/Entorno] En desarrollo se asigna un tenant privado a peticiones sin sesión

**Ubicación:** `lib/tenant-context.ts:118-122`.

**Evidencia:** ante la ausencia de sesión, cualquier petición fuera de producción retorna `getPrivateTenantContext()`. Durante la captura, el servidor de desarrollo anunció también una URL de red local y atendió `/dashboard` sin una sesión de QA.

**Impacto:** al ejecutar el servidor en una red compartida con el perfil privado configurado, una visita no autenticada puede operar contra datos de ese perfil. Aunque no afecta el comportamiento de producción, es un riesgo real de desarrollo/demostración.

**Corrección:** exigir una bandera explícita y de un solo propósito para habilitar el tenant de desarrollo, por defecto negar acceso; fijar el servidor dev a loopback en entornos con datos y usar una base/usuario de QA sin información real.

### [P2][Frontend/Mantenibilidad] El dashboard concentra estado, UI y mutaciones en un componente de 4,363 líneas

**Ubicación:** `app/Components/DashboardFinanciero.tsx`.

**Evidencia:** el mismo archivo contiene navegación responsive, modales, facturación, chat, dictado, importación, tablas, edición y borrado.

**Impacto:** aumenta regresiones, hace difícil aislar permisos/confirmaciones y vuelve impracticables pruebas de interacción completas.

**Corrección:** dividir por dominio (`Movements`, `Goals`, `Assistant`, `Billing`, `Settings`) y extraer hooks para fetch/mutaciones; tipar contratos API compartidos con Zod y añadir pruebas de componente/E2E por flujo crítico.

### [P2][Cobertura] Las pruebas pasan, pero no cubren rutas con efecto ni RLS real

**Evidencia:** hay 25 pruebas unitarias; no se encontró suite E2E, prueba contra proyecto Supabase efímero, ni automatización de los flujos login, importación-confirmación, borrado, avatar, dashboard y Stripe.

**Corrección:** añadir Playwright para público/auth/dashboard y Supabase local/CI para migraciones, RLS y aislamiento de dos perfiles. Bloquear el despliegue si no pasan migraciones, test RLS, lint, tipos, build y E2E críticos.

## Checklist de implementación

1. Bloquear el auto-registro por adjuntos y entregar confirmación determinista end-to-end.
2. Añadir límites previos a cuerpo, rate limit y créditos a los endpoints Gemini.
3. Reescribir i18n de forma declarativa y probar ambos idiomas.
4. Convertir borrado de cuenta a un proceso durable, idempotente y recuperable.
5. Reemplazar menú móvil y confirmaciones nativas con componentes accesibles.
6. Validar/recomprimir avatares en servidor.
7. Modularizar dashboard y construir E2E/RLS antes de una nueva salida a producción.

## Límites

No se afirma cobertura total del producto: faltan sesión autenticada, datos Supabase, Stripe, Gemini, webhooks externos, cron y cualquier app Android. No se modificó código de producto en esta auditoría.
