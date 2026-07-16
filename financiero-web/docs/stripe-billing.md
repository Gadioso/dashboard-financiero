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

## Estado actual

Sin suscripcion activa, el producto queda en `free`. Cuando el webhook registra una suscripcion `active` o `trialing`, `/api/account/status` devuelve `billing.plan = "beta"` o `billing.plan = "premium"` segun metadata/precio de Stripe.

## Limites iniciales

Los limites viven en `lib/billing.ts` y se aplican al agregar nuevas conexiones. Reconectar una integracion existente no consume cupo adicional.

| Plan | Bancos | Telegram | Sincronizacion historica |
| --- | ---: | ---: | ---: |
| free | 1 | 0 | 30 dias |
| beta | 2 | 1 | 365 dias |
| premium | 5 | 1 | 365 dias |

Endpoints con bloqueo por limite:

- `POST /api/bank/plaid/exchange-public-token`
- `POST /api/account/telegram-link-code`
- `POST /api/account/link-telegram`
