# Control de costes

## Proveedores activos

- Railway para un único contenedor Next.js.
- Supabase para base de datos, Auth, Storage, RLS y Cron.
- Gemini 2.5 Flash para conversación/herramientas y Flash-Lite para extracción, documentos y audio.
- Stripe sólo donde existe una función de negocio directa.
- Telegram como canal opcional sin suscripción de infraestructura.

Cada ejecución de IA escribe una línea JSON `[ai-usage]` con feature, modelo, tokens, latencia y éxito. Los logs se consultan en Railway; los eventos financieros y operativos durables permanecen en Supabase.

## Protecciones

- `AI_INTENT_LLM_ENABLED=false` evita usar el modelo para intenciones que pueden resolverse determinísticamente.
- Supabase Cron es el único scheduler.
- No existen proveedores de IA ni open banking de respaldo activos. Se habilita uno sólo ante una decisión explícita basada en uso, cobertura y coste.
- Revisar mensualmente Railway, Supabase, Gemini y Stripe.

## Modelo mensual de referencia (28 de julio de 2026)

Todos los importes de esta sección están en MXN por mes, antes de IVA. Para
convertir servicios cotizados en dólares se usa el FIX de Banxico del 27 de
julio de 2026: `17.444 MXN/USD`.

### Precios base verificados

- Railway: Hobby `USD 5`, Pro `USD 20`; la cuota se acredita al consumo. RAM
  `USD 10/GB-mes`, CPU `USD 20/vCPU-mes` y salida `USD 0.05/GB`.
- Supabase: Free `USD 0`; Pro `USD 25`, con `USD 10` de crédito de cómputo.
  Pro incluye 100,000 MAU, 8 GB de disco y 250 GB de salida.
- Gemini 2.5 Flash: `USD 0.30/M` tokens de entrada y `USD 2.50/M` de salida.
  Flash-Lite: `USD 0.10/M` de entrada y `USD 0.40/M` de salida.
- Hostinger: renovación `.com` de `MXN 329.99/año`, equivalente a `27.50/mes`.
- Telegram Bot API y SSL administrado por Railway: sin cuota adicional.
- Syncfy Banking, según la cotización 2026 recibida: mínimo `MXN 30,000/mes`;
  `MXN 20` por pull en el primer tramo o `MXN 200` por credencial con pulls
  ilimitados. Los precios no incluyen impuestos.
- Stripe México: sin cuota fija. Tarjetas nacionales `3.6% + MXN 3` y Billing
  `0.7%` del volumen de suscripciones, antes de IVA.

### Supuestos por escenario

| Escenario | Syncfy | IA por usuario | Stripe por usuario | Infraestructura |
| --- | ---: | ---: | ---: | --- |
| Optimista | `max(30,000; 20 × usuarios)` | USD 0.03 | MXN 14.61 | Hobby/Free al inicio; Pro desde 100 usuarios |
| Conservador | `max(30,000; 80 × usuarios)` | USD 0.25 | MXN 20.03 | Pro y escalado gradual de Railway/Supabase |
| Pesimista | `max(30,000; 200 × usuarios)` | USD 1.50 | MXN 25.45 | Más cómputo, base de datos e IA por usuario |

La comisión de Stripe supone que todos son usuarios de pago y usa como ticket
mensual USD 15, USD 22 y USD 29, respectivamente. No representa un costo fijo:
si no hay cobro, no existe esa comisión.

### Costo total y costo equitativo

| Escenario | Usuarios | Total mensual | Costo por usuario |
| --- | ---: | ---: | ---: |
| Optimista | 1 | 30,129.85 | 30,129.85 |
| Optimista | 10 | 30,266.05 | 3,026.61 |
| Optimista | 100 | 32,325.81 | 323.26 |
| Optimista | 1,000 | 46,294.68 | 46.29 |
| Conservador | 1 | 30,836.87 | 30,836.87 |
| Conservador | 10 | 31,056.39 | 3,105.64 |
| Conservador | 100 | 33,687.68 | 336.88 |
| Conservador | 1,000 | 107,820.08 | 107.82 |
| Pesimista | 1 | 30,864.10 | 30,864.10 |
| Pesimista | 10 | 31,328.64 | 3,132.86 |
| Pesimista | 100 | 37,892.92 | 378.93 |
| Pesimista | 1,000 | 259,057.20 | 259.06 |

Lectura por intervalos del costo unitario:

| Escenario | 1–10 usuarios | 10–100 usuarios | 100–1,000 usuarios |
| --- | ---: | ---: | ---: |
| Optimista | 30,129.85 → 3,026.61 | 3,026.61 → 323.26 | 323.26 → 46.29 |
| Conservador | 30,836.87 → 3,105.64 | 3,105.64 → 336.88 | 336.88 → 107.82 |
| Pesimista | 30,864.10 → 3,132.86 | 3,132.86 → 378.93 | 378.93 → 259.06 |

### Núcleo sin Syncfy ni comisión de cobro

Este es el costo técnico de Railway, Supabase, Gemini y dominio. Permite lanzar
con captura manual/Telegram y activar agregación bancaria sólo como módulo de
pago cuando exista suficiente demanda.

Para que el escenario sea comparable, se usa la misma infraestructura de
producción desde el primer usuario: Railway Pro, Supabase Pro y el dominio. El
único costo técnico que cambia entre escenarios es el consumo de Gemini. La
comisión de Stripe se mantiene en `MXN 14.61` por usuario de pago, calculada
sobre el plan de USD 15.

| Concepto | Tipo | Costo mensual |
| --- | --- | ---: |
| Railway Pro | Fijo | 348.88 |
| Supabase Pro | Fijo | 436.10 |
| Dominio | Fijo | 27.50 |
| Telegram | Fijo | 0.00 |
| SSL | Fijo | 0.00 |
| **Total fijo** |  | **812.48** |

| Escenario | Consumo Gemini por usuario | Stripe por usuario | Variable por usuario |
| --- | ---: | ---: | ---: |
| Optimista | 0.52 | 14.61 | 15.13 |
| Conservador | 4.36 | 14.61 | 18.97 |
| Pesimista | 26.17 | 14.61 | 40.78 |

La fórmula exacta es:
`total mensual = 812.48 + usuarios activos × Gemini + usuarios de pago × 14.61`.
La tabla supone, de forma conservadora, que todos los usuarios están activos y
son de pago. Si hay 1,000 cuentas pero sólo 300 usuarios activos y 100 de pago,
los componentes variables se calculan con 300 y 100, respectivamente.

| Escenario | Usuarios | Fijo | Gemini | Stripe | Total | Por usuario |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Optimista | 1 | 812.48 | 0.52 | 14.61 | 827.61 | 827.61 |
| Optimista | 10 | 812.48 | 5.23 | 146.10 | 963.81 | 96.38 |
| Optimista | 100 | 812.48 | 52.33 | 1,461.00 | 2,325.81 | 23.26 |
| Optimista | 1,000 | 812.48 | 523.32 | 14,610.00 | 15,945.80 | 15.95 |
| Conservador | 1 | 812.48 | 4.36 | 14.61 | 831.45 | 831.45 |
| Conservador | 10 | 812.48 | 43.61 | 146.10 | 1,002.19 | 100.22 |
| Conservador | 100 | 812.48 | 436.10 | 1,461.00 | 2,709.58 | 27.10 |
| Conservador | 1,000 | 812.48 | 4,361.00 | 14,610.00 | 19,783.48 | 19.78 |
| Pesimista | 1 | 812.48 | 26.17 | 14.61 | 853.26 | 853.26 |
| Pesimista | 10 | 812.48 | 261.66 | 146.10 | 1,220.24 | 122.02 |
| Pesimista | 100 | 812.48 | 2,616.60 | 1,461.00 | 4,890.08 | 48.90 |
| Pesimista | 1,000 | 812.48 | 26,166.00 | 14,610.00 | 41,588.48 | 41.59 |

La decisión económica fue retirar Syncfy: su mínimo mensual dominaba toda la
estructura hasta alcanzar entre 150 credenciales o 1,500 pulls. No conviene
activar el contrato de producción para una beta pequeña. Debe mantenerse como
add-on bancario de pago, negociarse un plan de arranque sin mínimo o posponerse
hasta contar con al menos 100–150 clientes bancarios de pago.

Fuentes: Railway (`https://docs.railway.com/pricing/plans`), Supabase
(`https://supabase.com/pricing`), Gemini
(`https://ai.google.dev/gemini-api/docs/pricing`), Stripe México
(`https://stripe.com/mx/pricing`), Hostinger
(`https://www.hostinger.com/mx/tld/dominio-com`) y Banxico
(`https://www.banxico.org.mx/apps/dao-web/4/52/Fix48.html`).
