# Seguridad y operacion

Esta guia cubre la base operativa antes de abrir la beta a mas usuarios: auditoria, errores, exportacion/borrado, backups y rotacion de secrets.

## SQL operativo

Genera el SQL y pegalo en Supabase SQL Editor:

```bash
npm run sql:operations
```

Esto crea:

- `audit_events`: acciones relevantes por usuario.
- `error_events`: errores operativos por usuario.
- `error_events.alerted_at`: marca de alerta enviada para no repetir avisos.
- RLS de lectura para que cada usuario vea solo sus propios eventos.

Las escrituras las hacen los endpoints con service role. Si la migracion no existe todavia, la app no se cae; solo omite escribir esos eventos hasta que corras el SQL.

## Auditoria de acciones

Se registran eventos como:

- `auth.login`, `auth.signup`, `auth.logout`
- `movement.create_ai`, `expense.delete`, `income.delete`
- `telegram.link`
- `bank.connection.created`, `bank.connection.updated`, `bank.sync`
- `billing.checkout.created`, `billing.portal.opened`, `billing.webhook.processed`
- `account.export`, `account.delete_data.requested`

La IP se guarda como hash, no en texto plano. Para cambiar la sal de ese hash, configura:

```bash
AUDIT_IP_HASH_SECRET=texto_largo_random
```

## Logs de errores

Los errores quedan en `error_events` con:

- `profile_id`
- `action`
- `message`
- `code`
- `severity`: `warning`, `error` o `critical`
- metadata sin secretos

## Alertas automaticas

Endpoint protegido:

```http
GET /api/ops/error-alerts
Authorization: Bearer <CRON_SECRET>
```

Supabase Cron ejecuta este endpoint. Revisa errores `error` y `critical` sin `resolved_at` y sin `alerted_at`. Si hay eventos nuevos, manda resumen a Telegram usando:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_NOTIFY_CHAT_ID=...
```

`TELEGRAM_NOTIFY_CHAT_ID` debe ser el `chat_id` del usuario o grupo receptor, no el
identificador del bot que devuelve `getMe`. El comando `/mi_id` enviado por el usuario
al bot muestra el valor correcto. El endpoint rechaza explícitamente el ID del propio
bot para evitar el error 403 `the bot can't send messages to the bot`.

Cuando Telegram responde OK, marca esos eventos con `alerted_at` para evitar avisos repetidos.
Los fallos del propio transporte de alertas no se vuelven a insertar en `error_events`;
eso evita que el monitor se alerte a sí mismo en cada ejecución. Los fallos históricos
de ese tipo se cierran como eventos recursivos al siguiente ciclo.

Supabase Cron debe enviar `Authorization: Bearer <CRON_SECRET>`. No se confia en `user-agent` para autorizar tareas programadas.

Los stack traces técnicos quedan en Railway y los eventos de negocio en Supabase.

## Exportacion de datos

Endpoint autenticado:

```http
GET /api/account/export
```

Devuelve un JSON con los datos del usuario actual. Excluye tokens OAuth y tokens bancarios cifrados.

## Borrado de datos

Endpoint autenticado:

```http
DELETE /api/account/data
Content-Type: application/json

{
  "confirmation": "BORRAR MIS DATOS",
  "deleteAuthUser": false
}
```

`deleteAuthUser: true` tambien elimina el usuario de Supabase Auth. Usalo solo desde una pantalla con doble confirmacion.

## Backups y restore

Checklist minimo:

1. Confirmar que Supabase tiene backups activos para el proyecto de produccion.
2. Antes de migraciones grandes, exportar snapshot o backup manual.
3. Mantener las migraciones SQL en git y aplicarlas en orden.
4. Probar restore en un proyecto/staging separado, nunca directo sobre produccion.
5. Hacer simulacro trimestral: restaurar backup, correr `npm run data:audit` y validar login + dashboard.
6. Documentar fecha, backup usado, responsable y resultado del simulacro.

Ultimo simulacro:

- Fecha: 2026-06-18.
- Metodo: dump logico de roles, esquema y datos con Supabase CLI; restore transaccional con `psql`.
- Destino: proyecto Supabase staging separado.
- Resultado: correcto. Coincidieron los conteos de 13 tablas criticas y `auth.users`.
- Produccion: usada solo como origen de lectura y verificada saludable despues del ejercicio.
- Pendiente manual de staging: configurar proveedores OAuth antes de probar login externo en ese entorno.

## Rotacion de secrets

Checklist por secret:

1. Crear el secret nuevo en el proveedor.
2. Agregarlo en Railway Production y Staging si aplica.
3. Redeploy.
4. Probar health, login y flujo afectado.
5. Revocar el secret viejo.
6. Registrar la rotacion en `audit_events` cuando exista una pantalla/admin interna para ello.

Secrets principales:

- `SUPABASE_SERVICE_ROLE_KEY`: rotar con mucho cuidado; afecta todos los endpoints server-side.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: actualizar si Supabase lo rota.
- `DASHBOARD_PRIVATE_TOKEN`: token de emergencia; mantenerlo solo como fallback.
- `TELEGRAM_BOT_TOKEN` y webhook secret: probar `/api/telegram/webhook`.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BETA_MONTHLY`, `STRIPE_PRICE_PREMIUM_MONTHLY`: probar checkout, portal y webhook.
- `CRON_SECRET`: actualizar cualquier job externo que lo use.

## Criterio de listo

Paso 7 queda en base operativa cuando:

- El SQL de operaciones esta aplicado.
- Build, lint y secret scan pasan.
- Exportacion y borrado responden solo con sesion autenticada.
- Hay checklist de backup/restore y rotacion documentado.
- Hay monitor de errores automatico en `/api/ops/error-alerts`.
- Railway recibe logs reales de producción y el restore drill tiene una ejecución exitosa documentada.
