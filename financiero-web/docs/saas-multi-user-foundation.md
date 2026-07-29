# Base SaaS multiusuario

## Identidad y aislamiento

- Supabase Auth administra registro, inicio de sesión y verificación de cuentas.
- Cada usuario tiene un `profile_id` derivado de `auth.uid()`.
- Todas las tablas financieras expuestas aplican RLS y restringen filas por propietario.
- El `service_role` solo se usa en rutas de servidor y nunca llega al navegador.

## Fuentes financieras

Virafi acepta tres fuentes activas:

- Integraciones bancarias de solo lectura.
- Captura desde Telegram asociado al perfil.
- Captura directa en la aplicación web.

Cada movimiento conserva propietario, origen y fecha. Las conexiones bancarias muestran estado, institución, consentimiento y última sincronización.

## Onboarding

1. Crear y verificar la cuenta.
2. Definir una primera meta financiera.
3. Confirmar ingresos y prioridades.
4. Conectar un banco o comenzar con captura manual.
5. Recibir el primer plan personalizado.

## Correo transaccional

Las verificaciones, recuperación de acceso y notificaciones de seguridad se gestionan mediante Supabase Auth. La identidad oficial de contacto y remitente es `info@virafi.com`.

Producción requiere SMTP personalizado, plantillas breves de Virafi, confirmación de correo activa y protección contra abuso. El correo transaccional no se utiliza como fuente de movimientos financieros.

## Operación

- `npm run tenant:bootstrap` prepara un perfil privado y su vínculo con Telegram.
- `npm run sql:multi-user` imprime la base multiusuario.
- `npm run launch:check` comprueba autenticación, aislamiento y health.
- `npm run restore:verify` valida una restauración en staging.

## Criterios antes de abrir la beta

- Registro y verificación funcionan de extremo a extremo.
- Un usuario nuevo empieza vacío.
- Dos usuarios no pueden consultar ni modificar datos entre sí.
- La desconexión bancaria revoca el acceso correspondiente.
- Exportación y eliminación de cuenta funcionan.
- Los mensajes transaccionales llegan desde el dominio oficial.
