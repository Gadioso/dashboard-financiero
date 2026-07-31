# Stripe billing

Billing usa Stripe Checkout en modo `subscription` y Stripe Customer Portal para que el usuario administre su plan sin que el dashboard procese tarjetas directamente.

## Variables requeridas

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BETA_MONTHLY`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `NEXT_PUBLIC_APP_URL`

## SQL

Ejecutar una vez en Supabase:

```bash
npm run sql:billing
```

Esto crea:

- `billing_customers`
- `billing_subscriptions`

Ambas tablas tienen `profile_id`, RLS y policies por `auth.uid()`.

## Endpoints

- `POST /api/billing/checkout`: crea Stripe Checkout para `beta` o `premium`.
- `POST /api/billing/portal`: abre Stripe Customer Portal.
- `POST /api/billing/webhook`: sincroniza estado de suscripcion desde Stripe.

## Webhook events

Configurar en Stripe:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Catálogo actual

- Esencial: **$199 MXN/mes**, 200 créditos IA.
- Pro: **$399 MXN/mes**, 500 créditos IA.
- Gratis: 25 créditos IA al mes, sin suscripción.
- Paquetes extraordinarios: 100 créditos por $49 MXN, 300 por $129 MXN o 700 por $279 MXN. El precio por crédito es deliberadamente mayor que subir de plan.

Los IDs configurados en `STRIPE_PRICE_BETA_MONTHLY` y `STRIPE_PRICE_PREMIUM_MONTHLY` deben ser precios recurrentes en MXN. Los paquetes se crean como precios únicos en MXN mediante lookup keys `virafi_credits-100_mxn_one_time`, `virafi_credits-300_mxn_one_time` y `virafi_credits-700_mxn_one_time`.

## Estado actual

Sin suscripcion activa, el producto queda en `free`. Cuando el webhook registra una suscripcion `active` o `trialing`, `/api/account/status` devuelve `billing.plan = "beta"` o `billing.plan = "premium"` segun metadata/precio de Stripe.

## Limites iniciales

Los límites viven en `lib/billing.ts` y actualmente se aplican a Telegram.

| Plan | Telegram |
| --- | ---: |
| free | 0 |
| beta | 1 |
| premium | 1 |

Endpoints con bloqueo por limite:

- `POST /api/account/telegram-link-code`
- `POST /api/account/link-telegram`
