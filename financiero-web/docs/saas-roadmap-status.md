# SaaS roadmap status

## Paso 1: Auditoria Supabase/Auth/OAuth

Estado: listo.

- Tablas multiusuario confirmadas.
- Tablas financieras con `profile_id`.
- RLS activo.
- Login real con Supabase Auth.
- `/api/account/status` responde con `profileScoped`.
- Produccion no cae al perfil privado cuando no hay sesion.
- Gmail y Telegram pertenecen a un usuario.

## Paso 2: Beta privada multiusuario

Estado: listo.

- Login/signup funcional.
- Dashboard por usuario.
- Datos aislados.
- Usuario nuevo empieza vacio.
- Usuario Diego conserva data.
- Telegram, Gmail/Banco y movimientos usan `profile_id`.
- Build/lint/security check pasan.

## Paso 3: Onboarding

Estado: funcional, en mejora.

- Crear cuenta.
- Perfil automatico.
- Presupuestos iniciales.
- Telegram self-serve.
- Gmail como fallback.
- Banco por pais con proveedor interno.
- Estado de configuracion.

## Paso 4: Gmail OAuth real

Estado: beta/fallback.

- OAuth con Google implementado.
- Tokens por usuario cifrados.
- Lectura de correos por usuario.
- Dedupe por `gmail_message_id`.
- Logs por usuario en `santander_ingest_logs`.
- Limitante: verificacion de Google para uso masivo con `gmail.readonly`.

## Paso 5: Telegram multiusuario

Estado: funcional.

- `telegram_chat_id` vinculado a `profile_id`.
- Registro en perfil correcto.
- Memoria separada.
- Link code self-serve.
- Pendiente: comandos de desconexion.

## Paso 6: Billing y planes

Estado: pendiente.

## Paso 7: Seguridad y operacion

Estado: parcial.

- Rate limit base.
- Secret scan.
- RLS.
- Pendiente: auditoria de acciones, alertas, backups, exportacion/borrado de datos y rotacion formal de secrets.

## Paso 8: Escala

Estado: en progreso.

- Indices por `profile_id` en tablas principales.
- Open Banking foundation.
- Plaid Link sandbox.
- Plaid sync crudo a `bank_accounts` y `bank_transactions_raw`.
- Pendiente: workers/queues, backpressure, monitoreo de costos y clasificacion asincrona.
