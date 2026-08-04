# Virafi dashboard design QA

## Cierre de pendientes — 2026-08-04

- **Duplicados OpenAI — resuelto.** Se conservaron sólo los datos canónicos: se eliminaron los dos cargos idénticos adicionales y la auditoría posterior no detecta duplicados dentro de ningún perfil.
- **Auditoría Santander — resuelto.** `santander_ingest_logs` no es una tabla inaccesible: fue eliminada de forma intencional junto con la ingestión por correo. El auditor la declara ahora como origen retirado (`freshness: not_applicable`) y no como una falla de acceso.
- **Perspectiva del hero — resuelto.** `.immersive-dashboard` ajusta perspectiva, rotación X/Y/Z, escala, origen y colocación para recuperar la inclinación y el encuadre de la captura aprobada.
- **Datos — pasa.** La corrida posterior reporta 122 gastos, 16 presupuestos y cero duplicados, presupuestos faltantes o presupuestos desfasados.
- **Calidad — pasa.** `npm test` (25/25), lint, TypeScript, build de producción y `git diff --check` finalizaron correctamente.

final result: passed

---

## Verificación posterior a correcciones — 2026-08-04

### Artefactos y normalización

- Fuente visual aprobada: `.design-captures/virafi-hybrid-approved.jpg` (1487 × 1058 px, español, estado inicial).
- Implementación renderizada: `/tmp/virafi-closure-2-desktop-es.png` (1487 × 1058 px, viewport CSS 1487 × 1058, densidad 1, español, estado inicial).
- Comparación de vista completa: `/tmp/virafi-closure-2-comparison.png`, fuente a la izquierda e implementación a la derecha; no se aplicó recorte, marco ni reescalado.
- Estado inglés: `/tmp/virafi-closure-2-desktop-en.png` (mismo viewport), después de seleccionar `en-US` en el control de idioma real.
- Estado móvil: `/tmp/virafi-closure-2-mobile-menu.png` (390 × 844 CSS px, densidad 1, menú abierto).

### Verificaciones

- **Copy/localización — resuelto.** En el DOM renderizado con `html[lang="en-US"]` están `$2,750 per month` y `$1,650 per month`; no queda `al mes` en la sección de metas. El aislamiento con `data-no-translate` funciona.
- **Menú móvil — pasa.** Hay un botón semántico único, abrió con `aria-expanded="true"` y Escape lo cerró con `aria-expanded="false"`.
- **Salud web — pasa.** La página tiene título y contenido significativo, no muestra overlay de framework y no produjo errores ni warnings de consola durante las interacciones probadas.

### Hallazgo accionable

1. **P2 — La perspectiva del panel hero aún es menor que en la fuente.**
   - Ubicación: `app/Components/MarketingHeroExperience.tsx` y `.immersive-dashboard` en `app/globals.css`.
   - Evidencia: en la comparación normalizada la fuente conserva laterales claramente convergentes y mayor inclinación; la implementación ya es más contenida que la iteración anterior, pero el panel todavía se lee casi frontal.
   - Impacto: es la única desviación visual P2 restante frente a la captura aprobada.
   - Corrección: aumentar la rotación visible (especialmente el eje Y/Z) hasta que los laterales y el plano superior se perciban con la inclinación de la fuente; repetir la captura a 1487 × 1058.

### Superficies de fidelidad

- Tipografía, espaciado del hero, colores, paisaje/activos, iconografía y copy español coinciden con la dirección de la referencia.
- La revisión focalizada del panel es necesaria porque su orientación no se decide con precisión en la vista completa; es la única superficie que sigue fuera de tolerancia.

### Historial

- Copy inglés anterior: bloqueado porque el proveedor global lo reescribía. Corrección observada: `data-no-translate`; evidencia posterior: aprobado en navegador.
- Hero anterior: recto y grande. Corrección observada: reducción/rotación. Evidencia posterior: la escala mejora, pero la inclinación todavía no alcanza la referencia.

final result: blocked

---

## Cierre de verificación — 2026-08-04

### Artefactos y normalización

- Fuente visual aprobada: `.design-captures/virafi-hybrid-approved.jpg` (1487 × 1058 px, español, estado inicial).
- Implementación renderizada: `/tmp/virafi-closure-desktop-es.png` (1487 × 1058 px, viewport CSS 1487 × 1058, densidad 1, español, estado inicial).
- Comparación de vista completa: `/tmp/virafi-closure-comparison.png`; fuente a la izquierda e implementación a la derecha, sin marco, recorte ni reescalado.
- Estado de idioma inglés: `/tmp/virafi-closure-desktop-en.png` (mismo viewport); se seleccionó `en-US` desde el selector real.
- Estado móvil: `/tmp/virafi-closure-mobile-menu.png` (390 × 844 CSS px, densidad 1, menú abierto).

### Comparación y evidencia

- La comparación compuesta vuelve a confirmar el P2 del panel: la fuente presenta el dashboard más compacto e inclinado; el render actual permanece prácticamente recto y de mayor tamaño. El CSS de `.immersive-dashboard` contiene un `transform`, pero el resultado visible no reproduce la inclinación/escala de la fuente.
- El componente declarativo contiene los dos importes correctos en inglés, pero la prueba en navegador no los muestra: con `html[lang="en-US"]` ambos siguen siendo `$2,750 al mes` y `$1,650 al mes`; ninguno de los dos textos `per month` existe en el DOM visible. `LocaleProvider` recorre y reescribe nodos de texto con `TreeWalker`/`MutationObserver`, por lo que invalida el render declarativo.
- Tipografía, colores, paisaje, iconografía y la estructura general coinciden con la dirección de la fuente. No se identificó una sustitución de activos ni una regresión de contraste visible en el estado comparado.
- Menú móvil: hay un único botón semántico; abrió (`aria-expanded="true"`) y Escape lo cerró (`aria-expanded="false"`).

### Hallazgos accionables

1. **P2 — El copy inglés aún no queda resuelto en ejecución.**
   - Ubicación: `app/Components/LocaleProvider.tsx`, especialmente la localización imperativa del DOM.
   - Evidencia: el estado inglés real conserva los dos textos españoles, aunque `MarketingGoalJourneys.tsx` declare los literales correctos.
   - Corrección: retirar o acotar la mutación global de nodos de texto y mantener el contenido de marketing renderizado declarativamente por locale; repetir esta misma prueba en navegador.
2. **P2 — El dashboard del hero no replica la perspectiva ni la escala aprobadas.**
   - Ubicación: `app/Components/MarketingHeroExperience.tsx` y reglas de `.immersive-dashboard` en `app/globals.css`.
   - Evidencia: comparación compuesta normalizada. La fuente muestra más perspectiva y un panel menor; el render actual es recto/grande.
   - Corrección: aumentar de forma visible la rotación/perspectiva, reducir ancho/escala y ajustar la posición hasta coincidir visualmente con la referencia; recapturar a 1487 × 1058.

### Historial de iteración

- Hallazgo previo: los importes ingleses usaban `al mes`.
- Cambio observado: se añadió `MarketingGoalJourneys.tsx` con copy ES/EN declarativo.
- Evidencia posterior: el DOM global todavía sobrescribe esos valores en inglés, por lo que el hallazgo no está cerrado.
- Hallazgo previo: el panel hero recto y grande.
- Evidencia posterior: sigue presente en la comparación compuesta actual.

final result: blocked

---

> Actualización de auditoría 2026-08-04: la ejecución actual encontró una desviación P1 de i18n y no contó con una referencia visual del mismo estado/viewport para hacer la comparación compuesta requerida. La auditoría actual queda bloqueada; ver `AUDITORIA_CORRECCIONES_2026-08-04.md`.

## QA visual actual — 2026-08-04

- Source visual truth: `docs/design/virafi-site-concept-top.png` (932 × 1688) y `docs/design/virafi-site-concept-bottom.png` (1536 × 1024).
- Implementation screenshots: `/tmp/virafi-audit-home-desktop.png` (1280 × 720, CSS 1280 × 720, density 1); `/tmp/virafi-audit-home-mobile.png` y `/tmp/virafi-audit-mobile-menu.png` (390 × 844, CSS 390 × 844, density 1); `/tmp/virafi-audit-login-mobile.png` (390 × 844, CSS 390 × 844, density 1).
- State: sitio público sin autenticación; hero, menú móvil y acceso. No se usó un device frame.
- Full-view comparison: no válido para aprobación porque las referencias existentes no son el mismo estado/crop que las capturas actuales; no hubo artefacto compuesto normalizado.
- Focused comparison: no procede hasta recibir/capturar una referencia que corresponda al estado actual.

**Findings**
- [P1] Idioma incoherente tras hidratación/interacción.
  Location: `app/Components/LocaleProvider.tsx` y páginas marketing.
  Evidence: la captura móvil muestra español al entrar y el menú abierto expone inglés con contenido parcialmente español; el proveedor muta el DOM fuera de React.
  Impact: la interfaz, `lang` y el árbol accesible pueden discrepar.
  Fix: render declarativo desde catálogos tipados, sin `TreeWalker`/`MutationObserver`, con locale decidido antes del render inicial.

**Open Questions**
- Falta un mockup/screenshot aprobado del mismo hero/menú/login y viewport para evaluar fidelidad, no sólo calidad y coherencia.
- El dashboard autenticado requiere una cuenta de QA aislada para capturar los estados financieros sin exponer datos reales.

**Implementation Checklist**
- Corregir i18n y repetir capturas desktop/móvil.
- Proveer referencia visual equivalente y construir comparación normalizada.
- Repetir QA visual hasta que no haya P0/P1/P2.

final result: blocked

---

## Evidence

- Source reference: `/var/folders/jv/9dlx6_gx68b8v1vnsj3m1frr0000gn/T/TemporaryItems/NSIRD_screencaptureui_YyFcX6/Captura de pantalla 2026-07-16 a la(s) 4.16.54 p.m..png` (2296 × 1424)
- Desktop implementation: `/private/tmp/virafi-dashboard-desktop.png` (viewport 1440 × 1000, summary with live local data)
- Mobile implementation: `/private/tmp/virafi-dashboard-mobile-viewport.png` (viewport 390 × 844, summary with live local data)
- Combined comparison: `/private/tmp/virafi-dashboard-comparison.png`

## Visual comparison

- Layout: matched the reference's persistent left navigation, compact account header, three-module first row, and three-column decision-support second row.
- Typography: retained Virafi's Newsreader/Figtree pairing, using the serif for greetings and financial hierarchy and the sans serif for controls and dense data.
- Color and surfaces: matched the warm cream canvas, thin warm borders, restrained elevation, violet navigation accent, and semantic emerald/orange/amber areas.
- Content: replaced the reference's fictional balances and bank brands with the dashboard's real financial data, current plan, actual movements, connected accounts, goals and investment context.
- Icons: replaced letter badges and legacy inline drawings with a consistent Phosphor outline/duotone family.
- Responsive behavior: at 390 px, the sidebar becomes the existing bottom navigation, cards stack without horizontal overflow, controls remain tappable, and the floating assistant remains reachable.

## Interaction and accessibility checks

- `Ver todos` opens the Movimientos view.
- `Resumen` returns to the summary dashboard.
- `Ir a asesoría personalizada` opens the existing financial assistant.
- The month selector remains a labelled native select.
- Desktop and mobile navigation expose current-page semantics and keyboard focus styles.
- Desktop document width: 1440 px viewport / 1440 px scroll width.
- Mobile document width: 390 px viewport / 390 px scroll width.
- Browser console errors and warnings: none.
- ESLint: passed.
- Production build and TypeScript: passed.

final result: passed

---

# QA visual residual — 2026-08-04

## Artefactos y normalización

- Fuente visual: `.design-captures/virafi-hybrid-approved.jpg` (1487 × 1058 px, español, estado inicial).
- Implementación: `/tmp/virafi-residual-reference-viewport.png` (1487 × 1058 px, viewport CSS 1487 × 1058, densidad 1, español, estado inicial).
- Comparación de vista completa: `/tmp/virafi-residual-comparison.png`, fuente a la izquierda e implementación a la derecha, sin marco de dispositivo ni reescalado.
- Estado móvil revisado: `/tmp/virafi-residual-mobile-menu.png` (390 × 844 CSS px, densidad 1, menú abierto).

## Evidencia funcional

- Inicio `http://localhost:3000/` carga contenido significativo con el título esperado y sin overlay de framework.
- Consola del navegador: sin warnings ni errores de aplicación.
- Menú móvil: el botón `Abrir navegación` abre la navegación, expone `aria-expanded`, y Escape lo cierra.

## Hallazgos

1. **P2 — Perspectiva y escala del dashboard del hero.** En la fuente el dashboard está levemente inclinado y ocupa un área más compacta; en la implementación se renderiza recto, más ancho y con distinta relación respecto de la ruta/landmarks. Es evidente en la comparación normalizada. Ajustar el transform, ancho máximo y posición del panel sólo si la captura aprobada continúa siendo la fuente de verdad.
2. **P2 — Localización inglesa incompleta.** Al cambiar a inglés, las cantidades de las tarjetas siguen terminando en `al mes`. La fuente española no cubre este estado, pero el render inglés lo confirma; completar la composición declarativa de copy antes de aprobar ambos locales.

## Superficies revisadas

- Tipografía: familia editorial, peso y jerarquía del hero conservan la dirección de la fuente; la diferencia visible proviene principalmente de escala/composición del panel.
- Espaciado y layout: header, CTAs, artwork y franja de prueba conservan la estructura; el panel de dashboard es la desviación accionable.
- Color/tokens: fondo marfil, violeta, negro editorial y la paleta de distribución coinciden visualmente.
- Imagen/activos: paisaje, ruta, landmarks, logo e iconografía se corresponden con la referencia, sin sustitutos visibles de baja fidelidad.
- Copy: el estado español coincide; el estado inglés conserva la inconsistencia anterior.

## Resultado

final result: blocked

---

# Auditoría visual independiente — 2026-08-04 (v2)

## Resultado

**blocked — no hay fuente visual vigente comparable.** La única fuente versionada, `docs/design/virafi-site-concept-top.png` (932 × 1688), muestra el producto anterior (“Tu dinero, con claridad y rumbo” y dashboard patrimonial). La implementación actual comunica “Your personal CFO”. Compararlas como si fueran el mismo estado produciría conclusiones de fidelidad falsas.

## Evidencia de implementación

- Inicio de escritorio: `http://localhost:3000/`, 1280 × 720 CSS px, densidad 1, idioma inglés; revisado en navegador integrado sin errores o warnings de la aplicación.
- Inicio móvil y menú abierto: 390 × 844 CSS px, densidad 1; el menú se abre y expone Producto, Nosotros, Seguridad e Iniciar sesión.
- Acceso: `http://localhost:3000/login?next=%2Fdashboard`, 1280 × 720 CSS px; sin errores o warnings de la aplicación.
- Capturas transitorias de la pasada: `/tmp/virafi-audit-v2-desktop-home.png`, `/tmp/virafi-audit-v2-mobile-menu.png`, `/tmp/virafi-audit-v2-mobile-menu-open.png`, `/tmp/virafi-audit-v2-login.png`.

## Comparación y hallazgos

No se emite aprobación de layout, tipografía, color, iconografía, imágenes o superficies frente a la referencia desactualizada. Sí se inspeccionó la implementación para defectos internos:

1. **P2, contenido/localización:** en inglés permanecen fragmentos españoles, incluido “$2,750 al mes” en el inicio y una mezcla amplia en la pantalla de acceso.
2. **P2, accesibilidad/interacción:** el control hamburguesa móvil se publica como `generic`, no `button`; faltan semántica y estados accesibles verificables.
3. **P3, proceso de diseño:** el resultado “passed” de secciones anteriores de este archivo no es aplicable a la implementación actual porque su fuente visual y copy pertenecen a otra dirección de producto.

## Condición para desbloquear

Proveer un diseño aprobado de la página actual para escritorio y móvil (Figma o capturas), con locale y estado definidos. La siguiente pasada hará comparación de vista completa y zonas focalizadas al mismo viewport, documentará diferencias y sustituirá este resultado por `passed` o `failed`.

---

# Virafi institutional website design QA

## Evidence

- Upper-page concept: `docs/design/virafi-site-concept-top.png`.
- Lower-page concept: `docs/design/virafi-site-concept-bottom.png`.
- Desktop implementation: `/tmp/virafi-site-hero.png` at 1440 × 1000.
- Mission/security implementation: `/tmp/virafi-site-purpose.png` at 1440 × 1000.
- Mobile implementation: `/tmp/virafi-site-mobile-final.png` at 390 × 844.
- Browser method: Codex in-app Browser with explicit 1440 × 1000 and 390 × 844 viewport overrides.

## Fidelity ledger

- Copy and hierarchy: header labels, hero headline, CTA labels, mission, vision, security statement, AI boundaries and footer content match the approved concepts. No unapproved hero eyebrow, badge or pill was added.
- Layout: preserved the editorial split hero, dashboard preview, four-column capability rail, three-step rising path, asymmetrical purpose section, dark security band, limits section and closing CTA/footer rhythm.
- Typography: retained the existing Newsreader/Figtree pairing. Serif headings, compact sans-serif controls and responsive line breaks were checked at both viewports.
- Palette and surfaces: retained Virafi cream, warm ink, thin warm borders and restrained violet. Semantic amber and emerald appear only inside the product preview.
- Asset treatment: all product UI remains code-native. The dashboard reference was rebuilt with semantic HTML and Phosphor icons; generated concepts are documentation only and are not shipped as page UI.
- Responsive behavior: initial mobile QA found hidden `<br>` elements collapsing headline spacing and forcing CTA overflow. The final pass restores editorial breaks, stacks CTAs and scales the product preview; document and viewport widths both measure 390 px.
- Navigation: Producto, Nosotros, Seguridad, legal pages, mobile menu and the create-account path were exercised. Authentication receives `next=/dashboard`.

## Functional and accessibility checks

- Public routes: `/`, `/producto`, `/nosotros`, `/seguridad`, `/privacy`, `/terms`.
- Product remains authenticated at `/dashboard`; public routes were added to the proxy allowlist.
- Desktop and mobile document widths match their viewports with no horizontal overflow.
- The mobile menu exposes Producto, Nosotros, Seguridad and Iniciar sesión.
- The privacy notice contains 14 navigable sections; terms contain 16.
- Semantic headings, main navigation labels, legal table of contents and footer links are present.
- Browser console errors and warnings: none.
- ESLint: passed.
- Production build and TypeScript: passed.

## Legal-content note

- The legal pages reflect the current documented product and the Mexican legal framework reviewed on 20 July 2026.
- The pages visibly flag that the contractual entity, RFC, full physical address and telephone must be confirmed before a general commercial launch; those facts were not present in the repository and were not invented.

final result: passed

---

# Virafi assistant, balance privacy and financial settings design QA

## Evidence

- Source visual truth: `/var/folders/jv/9dlx6_gx68b8v1vnsj3m1frr0000gn/T/TemporaryItems/NSIRD_screencaptureui_syDYdB/Captura de pantalla 2026-07-16 a la(s) 4.40.38 p.m..png` (832 × 520 assistant reference).
- Assistant implementation screenshot: `/private/tmp/virafi-assistant-qa.png` (browser viewport 1280 × 720, authenticated summary, assistant open).
- Financial settings implementation screenshot: `/private/tmp/virafi-onboarding-qa-final.png` (browser viewport 1280 × 720, authenticated, 75% prepared).
- Full-view comparison evidence: the source and implementation were opened together in one comparison output; the assistant keeps the supplied dark header, warm surfaces, rounded message panel and compact composer while removing the obsolete checkbox and adding attachment and microphone controls.
- Focused-region comparison: no separate crop was needed because the complete assistant and all composer controls are readable at native size in the comparison output.

## Findings

- No actionable P0, P1 or P2 findings remain.
- Fonts and typography: the existing Virafi Newsreader/Figtree hierarchy is preserved; the compact assistant uses the same small UI weights and readable line height as the dashboard.
- Spacing and layout rhythm: the assistant remains a compact bottom-right workspace. Attachment, input, microphone and send controls share an aligned 44 px row without overflow at the tested viewport.
- Colors and visual tokens: the warm cream, ink header, violet action and neutral borders stay within the established Virafi palette. Emerald configuration states remain semantic rather than decorative.
- Image quality and asset fidelity: all new visible controls use the installed Phosphor icon family; there are no placeholder assets, text glyph icons or handcrafted SVG approximations.
- Copy and content: `Usar esta vista` and the internal status-card language are gone. Configuration now describes user outcomes, and the balance explicitly says it represents connected bank accounts and excludes unconnected assets.
- Interaction and accessibility: the eye toggles both the balance and monthly income/expense values and updates its accessible name. The assistant exposes uniquely named attachment, microphone, send and close controls. The configuration links target the appropriate sections.

## Browser verification

- Primary interactions tested: opened the assistant from the sidebar; confirmed attachment and microphone controls; toggled `Ocultar saldos` to `Mostrar saldos`; verified masked values; restored values; opened `/onboarding`; verified all four configuration actions and anchors.
- The document/image picker is present with the intended accepted formats and multi-file support. No personal file was transmitted during visual QA.
- Browser console errors and warnings: none.
- ESLint: passed.
- Production build and TypeScript: passed.

## Comparison history

- Initial settings pass found a P2 accessibility duplication: the retired internal `Estado de configuración` block was visually hidden but still present in the accessibility tree.
- Fix: removed the duplicate block entirely, leaving the user-facing configuration journey as the single status surface.
- Post-fix evidence: `/private/tmp/virafi-onboarding-qa-final.png`; DOM verification confirmed the duplicate heading is absent and the browser console remains clean.

final result: passed

---

# Virafi login OAuth branding design QA

## Evidence

- Source visual truth: `/var/folders/jv/9dlx6_gx68b8v1vnsj3m1frr0000gn/T/TemporaryItems/NSIRD_screencaptureui_UHSp5w/Captura de pantalla 2026-07-16 a la(s) 4.18.43 p.m..png`
- Production implementation: `https://virafi.com/login`
- Desktop implementation screenshot: `/private/tmp/virafi-login-oauth-desktop.png` (browser viewport 1280 × 720)
- Mobile implementation screenshot: `/private/tmp/virafi-login-oauth-mobile.png` (browser viewport 390 × 844)
- Combined source/implementation comparison: `/private/tmp/virafi-login-oauth-comparison.png`
- State: account sign-in, email/password form visible, OAuth providers idle.

## Findings

- No actionable P0, P1, or P2 differences remain for the requested OAuth branding.
- Fonts and typography: the existing Newsreader/Figtree hierarchy is unchanged; both provider labels use the established compact UI weight and remain optically centered with their icons.
- Spacing and layout rhythm: both provider controls are 48 px high with a 12 px icon/label gap. They remain side-by-side on desktop and stack at 390 px without horizontal overflow.
- Colors and visual tokens: Google keeps the product's light surface and displays the recognizable multicolor mark. Apple uses a high-contrast black surface with a white Apple mark, matching familiar provider sign-in treatment while preserving Virafi's surrounding warm palette.
- Image quality and asset fidelity: both marks come from the installed `react-icons` library as sharp vector icons; no text glyphs, CSS drawings, emojis, or handcrafted SVG substitutes are used.
- Copy and content: the visible labels remain `Google` and `Apple`; accessible names are `Continuar con Google` and `Continuar con Apple`.
- Interaction and accessibility: both controls remain semantic buttons connected to the existing OAuth handlers, expose visible focus rings, and meet a 48 px tap-target height.

## Full-view and focused comparison

- The combined comparison confirms that the page composition, Virafi branding, form hierarchy, borders, radii, and spacing remain faithful to the supplied screen.
- The focused OAuth region shows the only intended change: the prior text-only buttons now include the multicolor Google G and the white Apple mark on a black Apple button.
- No additional focused crop was required because the provider controls and their 20 px icons are clearly readable in the combined comparison.

## Browser verification

- Desktop: one Google button and one Apple button found by accessible name; both measured 48 px high with 20 px icons; no horizontal overflow.
- Mobile: both buttons measured 308 × 48 px, stacked vertically; document width equals the 390 px viewport.
- Primary interactions verified: account sign-in state, provider buttons present and enabled, existing email/password form unchanged. Provider redirects were not invoked to avoid initiating an external OAuth session during visual QA.
- Browser console errors and warnings: none.
- ESLint: passed.
- Production build and TypeScript: passed locally and on Vercel.

## Comparison history

- Initial comparison: no P0/P1/P2 mismatch in the requested provider-branding region, so no visual correction loop was required.

final result: passed

---

# Virafi marketing redesign — visual QA

## Source of visual truth

- Desktop concept: `.design-captures/virafi-hybrid-approved.jpg`
- Mobile concept: `.design-captures/virafi-mobile-approved.jpg`
- Final desktop implementation: `.design-captures/virafi-implementation-desktop-final.jpg`
- Final mobile implementation: `.design-captures/virafi-implementation-mobile-final.jpg`
- Final mobile journey scene: `.design-captures/virafi-implementation-mobile-scene-final.jpg`

## Verification environment

- Desktop viewport: 1440 × 1024 CSS pixels, device scale factor 1.
- Mobile viewport: 390 × 844 CSS pixels, device scale factor 1.
- Browser: Codex in-app browser against `http://localhost:3000/`.
- Desktop document width: 1440 / 1440 (no horizontal overflow).
- Mobile document width: 390 / 390 (no horizontal overflow).
- Fresh-page browser console: no warnings or errors.

## Comparison evidence

The approved desktop concept and final desktop screenshot were inspected side by side at native viewport size. The approved mobile concept was compared with both the final first viewport and the focused landscape scene. Text and dashboard details remained readable in the full-view comparison, so no enlarged crop was necessary.

Five critical comparison points:

1. Typography — the editorial serif headline, italic Virafi wordmark, sans-serif body, labels, and button weights match the selected direction.
2. Composition — left-aligned copy, staged dashboard, illuminated goal route, home/travel/security landmarks, and proof strip preserve the approved hierarchy.
3. Spacing — navigation, hero copy rhythm, CTA spacing, dashboard overlap, and proof-strip entry align with the reference at desktop and collapse cleanly on mobile.
4. Color and image treatment — warm ivory surfaces, restrained violet accents, soft atmospheric landscape, and glass-like dashboard treatment match the approved palette and density.
5. Copy — navigation, above-the-fold headline, description, primary CTA, secondary CTA, dashboard greeting, daily recommendation, proof title, and proof labels match the approved concept.

## Iteration history

- Pass 1, P2: the proof headline rendered on one line instead of two. Fixed with a narrower heading measure and tuned type size.
- Pass 1, P2: mobile left too much space between the CTAs and dashboard. Fixed by compacting the mobile header and moving the dashboard and journey scene upward.
- Pass 1, P2: both responsive landscape sources were being requested during development. Fixed by using breakpoint-specific CSS backgrounds and optimized JPEG assets.
- Pass 2: repeated desktop/mobile screenshots and side-by-side inspection. No remaining P0, P1, or P2 visual issues.

## Interaction verification

- Scroll-driven hero progress updates in both directions; scrolling upward reverses the visual state.
- Desktop pointer movement adds restrained depth parallax.
- The secondary CTA navigates to `#como-funciona`.
- The mobile menu opens and exposes the primary navigation links.
- Reduced-motion styles remove the decorative movement while preserving content and navigation.

## Above-the-fold copy diff

No unintended differences. The implemented navigation, hero headline, body copy, CTAs, dashboard message, and proof points use the approved wording.

## Intentional deviation

The portrait concept shows the entire journey as one tall presentation board. In the implementation, the mobile scene is distributed across the natural page scroll so the dashboard, route, landmarks, and proof strip reveal progressively—the behavior requested for mobile rather than a compressed static composition.

## Result

passed

---

# Virafi sitewide motion refinement — visual QA

## Source and implementation evidence

- Desktop visual truth: `.design-captures/virafi-hybrid-approved.jpg` (1487 × 1058 px).
- Desktop implementation: `.design-captures/virafi-sitewide-motion-home-final.jpg` (1440 × 1024 px at a 1440 × 1024 CSS viewport, density 1).
- Mobile visual truth: `.design-captures/virafi-mobile-approved.jpg` (853 × 1844 px).
- Mobile implementation: `.design-captures/virafi-sitewide-motion-home-mobile-final.jpg` (390 × 844 px at a 390 × 844 CSS viewport, density 1).
- Secondary-route desktop evidence: `.design-captures/virafi-sitewide-motion-desktop-final.jpg` (`/seguridad`, 1440 × 1024).
- Secondary-route mobile evidence: `.design-captures/virafi-sitewide-motion-mobile-final.jpg` (`/seguridad`, menu open, 390 × 844).
- State: initial viewport after the route-entry transition settled.

## Full-view and focused comparison

The accepted desktop concept and the latest home render were opened together with `view_image`; the mobile concept and latest mobile render were inspected in the same way. The full-view comparison confirmed that the motion refactor did not change the approved typography, copy, layout, palette, dashboard framing, landscape treatment, navigation, CTAs, or first-section preview. Focused secondary-route screenshots confirmed that the shared motion layer preserves the existing Producto, Nosotros, Seguridad and legal-page compositions.

## Findings and comparison history

- Initial P2: the home reveal transformed both the section container and its children, doubling travel and opacity changes. Fixed by animating one item layer only.
- Initial P2: a CSS transition on the dashboard and route highlight competed with scroll-driven values, creating lag and a rubber-band effect. Fixed with one frame-rate-independent interpolation loop and smaller movement amplitudes.
- Initial P2: only the home route mounted the motion controller. Fixed by mounting it in `MarketingShell` and automatically covering public page heroes, sections, grouped list rows, legal sections, CTAs and footer content.
- Post-fix evidence: desktop scrolling changed hero progress from `0.9488` at 620 px to `0.2063` at 250 px and `0.0085` at the top, confirming smooth reversible movement.
- Post-fix route evidence: Producto (14+ animated targets), Nosotros (15+), Seguridad (13+), and Privacidad (53 targets across 17 motion sections) all initialized and responded to scroll without console warnings or errors.
- No actionable P0, P1 or P2 findings remain.

## Interaction and responsive verification

- Tested flow: Inicio → scroll down/up → `#como-funciona` → Producto → Nosotros → Seguridad → mobile menu → Privacidad.
- `#como-funciona` reached the expected hash and section position.
- Client-side route entry animation ran on each public route without reloading the shared header.
- Desktop and mobile documents matched their viewport widths (1440/1440 and 390/390); no horizontal overflow.
- Mobile navigation opened and navigated correctly.
- `prefers-reduced-motion` keeps all content visible and disables decorative transforms and transitions.
- Fresh Browser/IAB logs: no warnings or errors.

## Above-the-fold copy diff

No copy changes. The approved navigation, headline, body, CTAs, dashboard message and proof strip remain identical.

## Intentional deviation

As in the approved implementation, the tall mobile landscape is revealed progressively through natural page scroll rather than compressed into the first 844 px viewport.

final result: passed
