# Manual test plan

Ejecutar después de aplicar SQL/RLS y antes de considerar v1 lista.

## Dashboard

- Abrir `https://dashboard-financiero-chi.vercel.app`.
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

## Santander / Gmail

- Ejecutar Apps Script `santanderIngest`.
- Confirmar que un correo Santander real crea:
  - gasto si es compra/cargo,
  - abono TDC si es pago a tarjeta,
  - ingreso si realmente entra dinero.
- Confirmar que Telegram manda alerta al usuario `945363158`.
- Confirmar que duplicados no crean doble gasto.

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
- Sin cookie, `GET /api/email/santander` debe responder `401`.
- `POST /api/email/santander` sin secret debe responder `401`.
- `GET /api/health` debe responder `200` sin datos financieros.
- Supabase debe mostrar RLS habilitado en tablas financieras.

## Automatizado

```bash
npm run lint
npm run build
npm run test:santander-parser
npm run security:secrets
LAUNCH_CHECK_BASE_URL=https://dashboard-financiero-chi.vercel.app npm run launch:check
```
