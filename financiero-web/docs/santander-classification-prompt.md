# Santander Classification Prompt

Usa estos criterios para clasificar movimientos extraídos de correos Santander.

## Datos a extraer

- `concepto`: comercio o concepto limpio, por ejemplo `STARBUCKS PATIO PATRIA`.
- `monto`: número en MXN.
- `fechaMovimiento`: fecha/hora indicada en el cuerpo del correo, no solo fecha de recepción.
- `tipo`: `gasto` para compras/cargos/retiros/pagos; `ingreso` para depósitos/abonos/SPEI/transferencias recibidas.

## Categorías

- `Placeres`: consumo discrecional, ocio, lifestyle, cafés, restaurantes, delivery, streaming, viajes, bares, entretenimiento, hobbies, OXXO/7 Eleven ambiguos, Mercado Pago/PayPal ambiguos y comercios sin señal clara de necesidad.
- `Futuro`: inversiones, ahorro, GBM, CETES, ETFs, acciones, crypto, fondos, aportaciones patrimoniales.
- `Vida`: costo de vida u operación necesaria estricta: súper/despensa, farmacia/salud, gasolina, telefonía, servicios, renta/deuda, herramientas de trabajo y software operativo.

## Reglas de prioridad

1. Si el comercio/concepto menciona GBM, CETES, inversión, casa de bolsa, acciones o ETF: `Futuro / Inversion`.
2. Si menciona Starbucks, café, restaurante, cine, bar, Rappi, Uber Eats, Netflix, Spotify, viajes, hotel, Uber/Didi, Mercado Pago, PayPal, OXXO/7 Eleven sin señal de servicio o hobbies: `Placeres`.
3. Si menciona OpenAI, ChatGPT, Codex, Fiverr, Opus, Google, AWS, Vercel, GitHub, Notion, Zoom, Figma, Canva, Slack, Discord, Claude, Cursor, Windsurf, Replit, Midjourney, Runway, ElevenLabs o software usado para trabajar: `Vida / Herramientas Trabajo`.
4. Si menciona súper/despensa, farmacia, gasolina, luz, agua, Telcel, AT&T, Movistar, internet, Izzi, Totalplay, Telmex, doctor, hospital o carro: `Vida / Costo de Vida`.
5. Si no hay señal clara de necesidad, clasificar como `Placeres / Otros Placeres`. No usar `Vida` como default.

## Correos a ignorar

- SuperToken activado.
- Seguridad, avisos, publicidad, descarga de app, privacidad, confirmaciones sin monto.
- Cualquier correo sin señal Santander en remitente/asunto/cuerpo.

## Ejemplos

- `STARBUCKS PATIO PATRIA`, `$271.00` -> `gasto`, `Placeres`, `Cafe`.
- `OPENAI *CHATGPT SUBSCR`, `$399.00` -> `gasto`, `Vida`, `Herramientas Trabajo`.
- `CODEX`, `FIVERR`, `OPUS`, `TELCEL` -> `gasto`; Codex/Fiverr/Opus van a `Vida / Herramientas Trabajo`, Telcel va a `Vida / Costo de Vida`.
- `MERCADOPAGO *MARIADEL`, `OXXO JACARANDAS`, `7 ELEVEN T2718` -> `gasto`, `Placeres`, `Otros Placeres`, salvo que el texto diga recarga, servicio, salud o gasolina.
- `Transferencia a GBM`, `$100,000.00` -> `gasto`, `Futuro`, `Inversion`.
