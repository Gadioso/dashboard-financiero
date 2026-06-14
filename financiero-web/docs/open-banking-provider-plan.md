# Open Banking / Open Finance provider plan

Gmail queda como beta/fallback. La ruta fuerte para escalar el SaaS es conectar bancos con proveedores Open Banking en modo read-only.

## Prioridad

1. Plaid para Estados Unidos.
2. Prometeo para cobertura regional LATAM.
3. Belvo para LATAM, especialmente cuando la cobertura comercial convenga.
4. Finerio Connect para Mexico, sujeto a alta comercial.

## Variables de entorno

No guardar estos valores en git. Configurarlos en Vercel y, solo para pruebas locales, en `.env.local`.

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
BANK_TOKEN_ENCRYPTION_KEY=

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
   - mandar transacciones nuevas al clasificador actual
   - crear `gastos` / `ingresos` con `profile_id`
