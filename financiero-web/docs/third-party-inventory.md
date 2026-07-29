# Inventario de terceros

Última verificación: 29 de julio de 2026.

## Dependencias productivas

| Proveedor | Función | Datos o acceso | Sustituible |
| --- | --- | --- | --- |
| Railway | Contenedor web, red y despliegues | Código compilado y variables de entorno | Sí, por cualquier host Docker |
| Supabase | PostgreSQL, Auth, Storage y Cron | Datos de usuarios y producto | Sí, con una migración de datos y autenticación |
| Google Gemini | Clasificación, conversación, análisis y transcripción de audio | Prompts, texto, imágenes o audio enviados por la función solicitada | Sí, pero es el único proveedor de IA activo |
| Stripe | Suscripciones y portal de cobro | Identificadores de cliente, suscripción y eventos de pago | Sí, con una migración de billing |
| Telegram Bot API | Captura de movimientos y notificaciones opcionales | Mensajes y archivos que el usuario envía al bot | Sí; la web funciona sin Telegram |

## Fuentes públicas y gratuitas

Estas consultas no usan credenciales ni mantienen una conexión financiera del usuario. Si fallan, la información de mercados se degrada sin impedir el registro financiero principal.

| Fuente | Uso |
| --- | --- |
| Binance Public Market Data | Cotizaciones públicas de criptoactivos |
| Polymarket Gamma API | Contexto público de mercados predictivos |
| Google News RSS | Titulares para el briefing de inversiones |
| GDELT | Contexto noticioso público |

## Infraestructura auxiliar

- GitHub conserva el repositorio remoto.
- El DNS autoritativo de `virafi.com` está delegado a `dns-parking.com`; `www.virafi.com` apunta a Railway.
- npm distribuye dependencias de compilación. Las fuentes Figtree y Newsreader se descargan durante el build y Next.js las sirve desde el propio contenedor.

## Retirados

- Sentry: proyecto eliminado; sin SDK, DSN ni monitor activo.
- Vercel: hosting y configuración retirados; producción corre en Railway.
- Syncfy: integración, credenciales, cron, función, tablas y datos bancarios retirados. La cancelación y eliminación comercial fue solicitada a soporte.
- Plaid: integración y secretos retirados; la cuenta sandbox no tuvo acceso a producción. La eliminación del equipo requiere el código enviado al correo del propietario.
- Mastra, AssemblyAI y OpenAI: sin runtime, paquetes ni variables productivas. Gemini cubre IA y transcripción.

## Política

No se agrega un proveedor activo, de respaldo o de pago sin una decisión explícita de producto. El registro de movimientos es manual o por Telegram; Virafi no conecta cuentas bancarias.
