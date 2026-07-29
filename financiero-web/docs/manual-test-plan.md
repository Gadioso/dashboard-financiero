# Manual test plan

Ejecutar después de aplicar SQL/RLS y antes de considerar v1 lista.

## Dashboard

- Abrir `https://virafi.com`.
- Confirmar redirección a `/login`.
- Entrar con `DASHBOARD_ACCESS_TOKEN`.
- Confirmar que carga Junio 2026.
- Cambiar a Enero 2026 y verificar totales esperados:
  - Ingresos: `$29,258.00`
  - Egresos: `$18,271.00`
- Cambiar a Junio 2026 y confirmar:
  - Ingresos cargados.
  - Gastos Santander visibles.
  - Abonos TDC visibles.
  - Tabla mensual de ingresos y egresos.

## Registro web

- Registrar ingreso: `Gané 15000 de Aire en efectivo`.
- Confirmar que el presupuesto se reparte `5000 / 5000 / 5000`.
- Registrar gasto: `Pagué 120 de café`.
- Confirmar que aparece como `Placeres`.
- Eliminar el gasto de prueba.
- Eliminar el ingreso de prueba.

## Origen de movimientos

- Confirmar que los movimientos automáticos del proveedor muestran `Banco` o `Banco · <institución>`.
- Confirmar que los movimientos registrados por el bot muestran `Telegram`.
- Confirmar que los movimientos registrados manualmente muestran `Web`.
- Confirmar que ningún movimiento muestra `Santander Email`.

## Telegram

Enviar al bot:

- `mi id`
- `últimos gastos`
- `cuáles fueron mis gastos de ayer`
- `cuánto gasté en placeres en enero`
- `cuánto debo de tarjeta`
- `registrame 15000 de ingreso de Aire`
- `pagué 120 de café`
- `cámbialo a vida`
- `cámbialo a placer`
- `borra café`
- `confirmar eliminar g<ID>`

## Seguridad

- Sin cookie, `GET /api/dashboard?mes=2026-06` debe responder `401`.
- `GET /api/health` debe responder `200` sin datos financieros.
- `GET /api/health` con `x-healthcheck-secret` o `Authorization: Bearer <CRON_SECRET>` debe reportar `capabilities.telegramVoice=true` cuando exista al menos un proveedor de transcripción.
- Supabase debe mostrar RLS habilitado en tablas financieras.
- Con token válido, `launch:check` debe confirmar que `anon` no puede escribir en `gastos`.

### Control de acceso de Telegram

- Un chat privado no vinculado que envía `hola` no recibe respuesta.
- Un chat privado no vinculado que envía una llave inexistente no recibe respuesta.
- Un grupo, supergrupo, canal u otro bot no recibe respuesta.
- Una llave válida generada desde una sesión autenticada vincula el chat una sola vez.
- Un chat vinculado recibe confirmación con `/estado`.
- `/desconectar` elimina `telegram_accounts` y `telegram_memoria`; mensajes posteriores no reciben respuesta.
- Borrar o bloquear el usuario de Supabase Auth revoca el vínculo en la siguiente interacción y evita notificaciones proactivas y bancarias.

## Automatizado

```bash
npm run lint
npm run build
npm run test:card-payment-intent
npm run ops:env-audit
npm run security:secrets
LAUNCH_CHECK_BASE_URL=https://virafi.com npm run launch:check
LAUNCH_CHECK_BASE_URL=https://virafi.com LAUNCH_CHECK_DASHBOARD_TOKEN=... npm run launch:check
```
