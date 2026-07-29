# Wealth: contexto de inversión sin custodia

## Alcance del producto

Dashboard Financiero calcula cuánto puede destinar el usuario, explica la distribución, muestra contexto de mercado y lo dirige a una plataforma externa. No recibe, custodia ni transfiere dinero y no coloca órdenes por cuenta del usuario.

## Fuentes

- Binance Spot Market Data: precios y volumen público de cripto. Usar `https://data-api.binance.vision` cuando solo se requieran datos públicos.
- Polymarket Gamma y CLOB: mercados, probabilidades implícitas, precios y liquidez pública. No usar la API autenticada para ejecutar órdenes.
- Alpaca Market Data: precios, barras y snapshots de acciones y ETFs. Requiere `ALPACA_API_KEY_ID` y `ALPACA_API_SECRET_KEY` guardadas únicamente en Railway.
- Alpaca News: titulares, resumen, símbolos, fuente y URL mediante REST o WebSocket. Requiere las mismas credenciales de Market Data.

## Orden de implementación

1. Contexto público de cripto y mercados predictivos.
2. Snapshots de acciones y ETFs de Alpaca.
3. Noticias de Alpaca filtradas por los instrumentos mostrados.
4. Agente que explique impacto, riesgos y relación con el presupuesto del usuario.
5. Enlace externo a la plataforma elegida; el usuario completa ahí la operación.

## Reglas para recomendaciones

- La cantidad máxima sale del presupuesto y del perfil guardado, nunca de una noticia.
- El momento predeterminado es una aportación periódica; no se promete predecir máximos o mínimos.
- Cada sugerencia debe mostrar fuente, fecha, costos por revisar, riesgo, horizonte y motivo de invalidación.
- Las noticias sirven para explicar cambios de riesgo, no para producir una orden automática.
- No exponer claves ni credenciales en el navegador.

## Credenciales pendientes

Para activar acciones, ETFs y noticias en producción se requieren dos variables privadas en Railway:

- `ALPACA_API_KEY_ID`
- `ALPACA_API_SECRET_KEY`

Comenzar con una cuenta de paper trading y el feed IEX. No habilitar operaciones reales.
