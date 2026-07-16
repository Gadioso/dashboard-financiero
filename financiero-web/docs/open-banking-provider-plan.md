# Open Banking / Open Finance provider plan

Gmail/Santander queda retirado. La ruta para escalar el SaaS es conectar bancos con proveedores Open Banking en modo read-only; los otros orígenes de captura son Telegram y web.

## Prioridad

1. Syncfy para Mexico.
2. Plaid para Estados Unidos.
3. Prometeo para cobertura regional LATAM.
4. Belvo para LATAM, especialmente cuando la cobertura comercial convenga.
5. Finerio Connect para Mexico, sujeto a alta comercial.

## Variables de entorno

No guardar estos valores en git. Configurarlos en Vercel y, solo para pruebas locales, en `.env.local`.

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
BANK_TOKEN_ENCRYPTION_KEY=

SYNCFY_ENV=sandbox
SYNCFY_BASE_URL=https://opendata-api.syncfy.com/v1
SYNCFY_API_KEY=

PROMETEO_API_KEY=
PROMETEO_ENV=sandbox

BELVO_SECRET_ID=
BELVO_SECRET_PASSWORD=
BELVO_ENV=sandbox

FINERIO_CLIENT_ID=
FINERIO_CLIENT_SECRET=
FINERIO_ENV=sandbox
```

## Supabase

Aplicar la migracion:

```bash
npm run sql:open-banking
```

Tablas nuevas:

- `bank_connections`: una conexion bancaria por usuario/proveedor/institucion.
- `bank_accounts`: cuentas y balances leidos desde el proveedor.
- `bank_transactions_raw`: movimientos crudos antes de clasificarlos como gasto/ingreso.
- `bank_sync_runs`: auditoria de sincronizaciones.

Todas usan `profile_id` y RLS con `auth.uid()`.

## Syncfy Mexico sandbox

Syncfy es el proveedor principal para Mexico. La integracion queda read-only para el MVP:

- base sandbox confirmada: `https://opendata-api.syncfy.com/v1`
- autenticacion: header `Authorization: API_KEY api_key=...`
- catalogo de paises: `GET /catalogues/countries`
- catalogo de sitios por pais: `GET /catalogues/sites?country=MX`
- organizaciones/sitios: `GET /sites?country=MX`
- ruta interna inicial: `GET /api/bank/syncfy/catalogue?country=MX`
- crear/reusar usuario Syncfy: `POST /v1/users`
- crear sesion corta para widget: `POST /v1/sessions`
- ruta interna de sesion: `POST /api/bank/syncfy/session`
- pagina interna del widget: `/bank/syncfy`

No se habilitan pagos, transferencias ni initiation flows en esta fase. El siguiente paso es usar el endpoint de `credentials/pulls` con usuarios sandbox de prueba y mapear cuentas/transacciones hacia `bank_accounts` y `bank_transactions_raw`.

## API interna inicial

`GET /api/bank/providers` devuelve que proveedores estan configurados por env var sin exponer secretos.

## Siguiente implementacion

1. Plaid Link sandbox:
   - `POST /api/bank/plaid/link-token`
   - `POST /api/bank/plaid/exchange-public-token`
   - sincronizar `/transactions/sync`
2. Prometeo sandbox:
   - flujo de credencial/link segun institucion sandbox disponible
   - normalizar cuentas y transacciones al mismo modelo interno
3. Motor comun:
   - normalizar montos y fechas
   - deduplicar por `connection_id + provider_transaction_id`
   - mandar transacciones nuevas al clasificador actual con `POST /api/bank/transactions/classify`
   - crear `gastos` / `ingresos` con `profile_id`
   - procesar en lotes chicos con `BANK_CLASSIFICATION_BATCH_SIZE` para backpressure
   - auditar conteos de procesadas, clasificadas, fallidas y pendientes restantes
