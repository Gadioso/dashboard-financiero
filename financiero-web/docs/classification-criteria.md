# Criterios de clasificación financiera

El sistema clasifica cada movimiento en una de tres bolsas: `Vida`, `Placeres` o `Futuro`.

## Vida

Gastos necesarios, recurrentes u operativos. Incluye:

- Servicios: luz, agua, internet, Telcel, AT&T, Movistar, Izzi, Totalplay, Telmex.
- Transporte necesario: gasolina, Uber/Didi si el contexto es traslado necesario, metro, camión.
- Salud: doctor, hospital, farmacia, medicina.
- Herramientas de trabajo: OpenAI, ChatGPT, Codex, Fiverr, Opus, Google, AWS, Vercel, GitHub, Notion, Zoom, Figma, Canva, Claude, Cursor.
- Super/despensa cuando el concepto indique compra básica.

## Placeres

Consumo discrecional, estilo de vida, ocio o salidas. Incluye:

- Café, Starbucks, restaurantes, tacos, bares, cine, conciertos.
- Delivery: Rappi, Uber Eats.
- Viajes, hoteles, entretenimiento.
- OXXO por default cuando no hay señal clara de necesidad.

## Futuro

Ahorro, inversión, patrimonio o protección financiera. Incluye:

- GBM, CETES, ETF, acciones, casa de bolsa, crypto/inversiones.
- Fondo de emergencia.
- Seguros y ahorro patrimonial.

## Comercios ambiguos

Algunos comercios no bastan por sí solos para decidir. El principal caso actual:

- `OXXO` se clasifica como `Placeres / Otros Placeres` por default.
- `OXXO` cambia a `Vida / Costo de Vida` si el texto menciona recarga, Telcel, AT&T, Movistar, servicio, luz, agua, internet, depósito, farmacia, medicina o gasolina.

## Aprendizaje por corrección

Cuando Diego corrige un gasto por Telegram con frases como:

```txt
cámbialo a vida
cámbialo a placer
cámbialo a futuro
```

el sistema corrige el movimiento y, si la tabla `classification_preferences` existe, guarda una preferencia para comercios futuros similares.
