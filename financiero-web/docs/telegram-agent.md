# Agente Telegram Financiero

El bot de Telegram registra movimientos y responde consultas usando los datos de Supabase.

## Acciones soportadas

### Registrar gastos

Ejemplos:

- `pagué 250 de gasolina`
- `150 tacos`
- `399 openai`
- `299 codex`
- `metí 1000 a cetes`

El agente clasifica el movimiento en `Vida`, `Placeres` o `Futuro` y lo guarda en la tabla `gastos`.

### Registrar ingresos

Ejemplos:

- `gané 60000 de sueldo`
- `me pagaron 12500 de aire mensualidad`
- `ingresó 10000 freelance`

El agente guarda el ingreso y recalcula el presupuesto mensual 33/33/33.

### Consultar resumen

Ejemplos:

- `cómo voy este mes`
- `cuánto me queda para placeres`
- `cuánto tengo que invertir`
- `resumen de mayo`
- `cuánto me queda en febrero 2026`

El agente responde con ingresos, promedio de últimos 3 meses, presupuesto por bolsa, gasto acumulado y restante.

### Conversar con contexto financiero

Para preguntas abiertas que no sean comandos directos, el agente usa LLM con un contexto calculado desde Supabase: ingresos del mes, promedio de ingresos de 3 meses, presupuesto 33/33/33, gasto por bolsa y gastos recientes.

Ejemplos:

- `que opinas de mis gastos este mes`
- `donde estoy gastando de mas`
- `que deberia cuidar antes de salir el fin`
- `voy bien con inversion`
- `hazme un resumen inteligente de junio`

El LLM no escribe directamente en Supabase. Si detecta que el usuario quiere registrar, listar o borrar, debe sugerir el comando exacto para que el flujo seguro lo procese.

### Ver gastos

Ejemplos:

- `últimos gastos`
- `últimos 5 gastos`
- `gastos de placeres de junio`
- `gastos de vida enero 2026`
- `gastos de futuro abril`

Cada gasto se muestra con un ID corto para poder borrarlo con confirmación.

### Eliminar gastos

El borrado es de dos pasos para evitar errores.

1. Buscar el gasto:

```text
borra starbucks
```

2. Confirmar con el ID corto:

```text
confirmar eliminar abc12345
```

Si hay varios candidatos, el bot muestra opciones y no borra nada hasta recibir una confirmación específica.

## Requisitos para funcionar fuera de local

Telegram no puede llamar a `localhost`. El endpoint `/api/telegram/webhook` necesita una URL pública en Vercel, Cloudflare o un túnel temporal.

Variables requeridas:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` recomendado para evitar bloqueos por RLS.
- `GOOGLE_API_KEY` o `GEMINI_API_KEY` para clasificación con IA cuando las reglas locales no alcanzan.
- `GOOGLE_API_KEY` o `GEMINI_API_KEY` para conversación abierta con contexto financiero.
