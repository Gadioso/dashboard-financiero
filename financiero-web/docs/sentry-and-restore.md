# Sentry y simulacro de restore

## Sentry

La integración queda desactivada automáticamente mientras no exista DSN. No bloquea builds locales ni producción.

Variables para Vercel:

```bash
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...
SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

`SENTRY_AUTH_TOKEN` se usa durante build para subir source maps. Debe existir solo en Vercel y nunca en git.

Prueba extremo a extremo, protegida por `CRON_SECRET`:

```bash
curl -s -X POST https://dashboard-financiero-chi.vercel.app/api/ops/sentry-test \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"confirmation":"SENTRY_TEST"}'
```

La respuesta incluye un `eventId`. El evento debe aparecer en Sentry como `Dashboard Financiero Sentry integration test`.

Privacidad:

- `sendDefaultPii` está desactivado.
- No se habilitó Session Replay.
- Los errores operativos no envían `actor_email` a Sentry.
- Los IDs de perfil se usan solo como tag técnico para investigar aislamiento multiusuario.

## Restore drill

El restore real debe hacerse en un proyecto Supabase separado. Nunca ejecutar el ejercicio sobre producción.

En `.env.restore.local`:

```bash
STAGING_SUPABASE_URL=...
STAGING_SUPABASE_SERVICE_ROLE_KEY=...
PRODUCTION_SUPABASE_URL=...
PRODUCTION_DATABASE_URL=...
STAGING_DATABASE_URL=...
```

Después de restaurar el backup en staging:

```bash
npm run restore:verify
```

El script:

- Bloquea la ejecución si staging y producción tienen el mismo host.
- Comprueba tablas críticas.
- Reporta conteos sin imprimir filas financieras.
- Deja una lista de validaciones manuales de login, dashboard y escritura.

## Ejecucion 2026-06-18

- Se genero un dump logico privado de roles, esquema y datos fuera del repositorio.
- Se restauro en una transaccion sobre un proyecto staging separado.
- `npm run restore:verify` confirmo las 13 tablas criticas.
- Los conteos de produccion y staging coincidieron, incluyendo `auth.users`.
- Los proveedores OAuth y sus callbacks deben configurarse manualmente si se quiere probar login en staging.
