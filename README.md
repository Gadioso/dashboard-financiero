# Virafi

Virafi es una aplicación financiera multiusuario en Next.js. La arquitectura productiva usa Railway para ejecutar la aplicación, Supabase como fuente canónica de identidad y datos, Gemini como único proveedor de IA y Stripe para cobros. Los movimientos se registran manualmente, por importación de archivos o mediante canales de mensajería aprobados; Virafi no conecta cuentas bancarias.

## Estructura

- `financiero-web/`: aplicación Next.js, APIs y configuración de Railway.
- `financiero-web/supabase/migrations/`: esquema, RLS y tareas programadas.
- `docs/`: decisiones de arquitectura.

La aplicación es un monolito modular. Las consultas privilegiadas siempre se filtran por `profile_id`; las escrituras financieras iniciadas por IA permanecen detrás de confirmaciones determinísticas.

## Desarrollo

Requiere Node.js `>=22.13.0`.

```bash
npm install --prefix financiero-web
cp financiero-web/.env.example financiero-web/.env.local
npm run dev
```

Verificación:

```bash
npm test
npm run lint
npm run build
```

## Despliegue en Railway

El servicio debe usar `financiero-web` como Root Directory. Railway detecta `Dockerfile` y `railway.json`; el contenedor escucha el `PORT` inyectado y valida `/api/health` antes del cambio de tráfico.

1. Conecta el repositorio desde Railway.
2. Selecciona `financiero-web` como Root Directory.
3. Copia las variables documentadas en `financiero-web/.env.example` al entorno Production.
4. Genera un dominio Railway, valida el despliegue y agrega `virafi.com` como dominio personalizado.
5. Cambia DNS sólo después de comprobar login, Stripe, Telegram y los endpoints programados.

Supabase Cron es el único programador de tareas. El dominio estable `https://virafi.com` desacopla esas tareas del proveedor de hosting.

Nunca publiques archivos `.env`, service-role keys, tokens de proveedores ni datos bancarios.
