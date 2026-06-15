import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe-server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { normalizeProfileId } from '@/lib/tenant-context';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';

export const dynamic = 'force-dynamic';

function dateFromStripeTimestamp(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function findProfileIdForCustomer(stripeCustomerId?: string | null) {
  if (!stripeCustomerId) return null;

  const supabase = getSupabaseServiceClient();

  if (!supabase) return null;

  const { data } = await supabase
    .from('billing_customers')
    .select('profile_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  return normalizeProfileId(data?.profile_id || null);
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const supabase = getSupabaseServiceClient();

  if (!supabase) throw new Error('Falta configurar Supabase.');

  const subscriptionData = subscription as Stripe.Subscription & {
    current_period_end?: number | null;
    trial_end?: number | null;
  };
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const profileId = normalizeProfileId(subscription.metadata?.profile_id || null) || await findProfileIdForCustomer(stripeCustomerId);

  if (!profileId) {
    throw new Error(`No pude asociar suscripción ${subscription.id} con un profile_id.`);
  }

  const firstItem = subscription.items.data[0];
  const { error } = await supabase.from('billing_subscriptions').upsert(
    {
      profile_id: profileId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      plan: subscription.metadata?.plan === 'beta' ? 'beta' : 'premium',
      price_id: firstItem?.price?.id || null,
      current_period_end: dateFromStripeTimestamp(subscriptionData.current_period_end || null),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      trial_end: dateFromStripeTimestamp(subscriptionData.trial_end || null),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' }
  );

  if (error) throw new Error(`No pude guardar suscripción de Stripe: ${error.message}`);

  return {
    profileId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
  };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripeClient();
  const supabase = getSupabaseServiceClient();

  if (!stripe || !supabase) throw new Error('Falta configurar Stripe o Supabase.');

  const profileId = normalizeProfileId(session.metadata?.profile_id || session.client_reference_id || null);
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (profileId && stripeCustomerId) {
    await supabase.from('billing_customers').upsert(
      {
        profile_id: profileId,
        stripe_customer_id: stripeCustomerId,
        email: session.customer_details?.email || session.customer_email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    );
  }

  if (typeof session.subscription === 'string') {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    return upsertSubscription(subscription);
  }

  return {
    profileId,
    stripeCustomerId: stripeCustomerId || null,
    stripeSubscriptionId: null,
    status: null,
  };
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ success: false, error: 'Faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature') || '';
  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Firma de Stripe inválida.';
    await logErrorEvent({
      supabase: getSupabaseServiceClient(),
      request,
      action: 'billing.webhook.verify',
      error,
      code: 'stripe_signature_invalid',
      severity: 'warning',
    });
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  try {
    let result:
      | {
          profileId: string | null;
          stripeCustomerId: string | null;
          stripeSubscriptionId: string | null;
          status: string | null;
        }
      | undefined;

    if (event.type === 'checkout.session.completed') {
      result = await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      result = await upsertSubscription(event.data.object as Stripe.Subscription);
    }

    await logAuditEvent({
      supabase: getSupabaseServiceClient(),
      request,
      profileId: result?.profileId || null,
      action: 'billing.webhook.processed',
      resourceType: 'stripe_event',
      resourceId: event.id,
      metadata: {
        eventType: event.type,
        stripeCustomerId: result?.stripeCustomerId || null,
        stripeSubscriptionId: result?.stripeSubscriptionId || null,
        status: result?.status || null,
      },
    });

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude procesar webhook de Stripe.';
    await logErrorEvent({
      supabase: getSupabaseServiceClient(),
      request,
      action: 'billing.webhook.process',
      error,
      code: 'stripe_webhook_processing_failed',
      metadata: {
        eventId: event.id,
        eventType: event.type,
      },
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
