# Operación y restauración

Virafi usa tres fuentes de diagnóstico sin una suscripción separada de observabilidad:

- logs stdout/stderr del contenedor en Railway;
- `error_events` y `audit_events` en Supabase;
- `/api/ops/error-alerts` para notificaciones operativas.

El endpoint público `/api/health` sólo confirma disponibilidad. Una petición autenticada con `HEALTHCHECK_SECRET` o `CRON_SECRET` devuelve capacidades configuradas sin revelar valores.

Los ejercicios de restauración se ejecutan con:

```bash
npm run restore:verify
```

No restaures encima de producción. Usa una base aislada y valida conteos, RLS y funciones antes de promover datos.
