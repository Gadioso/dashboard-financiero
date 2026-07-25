import { NextResponse } from 'next/server';
import type { BillingPlan } from '@/lib/billing';
import { getAppBaseUrl, getOrCreateStripePriceForPlan, getStripeClient } from '@/lib/stripe-server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';

export const dynamic = 'force-dynamic';

type CheckoutBody = {
  plan?: BillingPlan;
};

function parseCheckoutPlan(value: unknown): Exclude<BillingPlan, 'free'> {
  return value === 'beta' ? 'beta' : 'premium';
}

async function getOrCreateStripeCustomer({
  email,
  profileId,
  supabase,
}: {
  email?: string | null;
  profileId: string;
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
}) {
  const existing = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (existing.data?.stripe_customer_id) return existing.data.stripe_customer_id as string;

  const stripe = getStripeClient();

  if (!stripe) throw new Error('Falta configurar STRIPE_SECRET_KEY.');

  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: {
      profile_id: profileId,
    },
  });

  const { error } = await supabase.from('billing_customers').upsert(
    {
      profile_id: profileId,
      stripe_customer_id: customer.id,
      email: email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' }
  );

  if (error) throw new Error(`No pude guardar el cliente de Stripe: ${error.message}`);

  return customer.id;
}

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const supabase = getSupabaseServiceClient();
    const body = (await request.json().catch(() => ({}))) as CheckoutBody;
    const plan = parseCheckoutPlan(body.plan);
    const priceId = await getOrCreateStripePriceForPlan(plan);

    if (!stripe || !priceId) {
      return NextResponse.json({ success: false, error: 'El pago seguro todavía no está disponible.' }, { status: 503 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const customerId = await getOrCreateStripeCustomer({
      email: tenant.email,
      profileId: tenant.profileId,
      supabase,
    });
    const baseUrl = getAppBaseUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${baseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard?billing=cancelled`,
      client_reference_id: tenant.profileId,
      metadata: {
        profile_id: tenant.profileId,
        plan,
      },
      subscription_data: {
        metadata: {
          profile_id: tenant.profileId,
          plan,
        },
      },
    });

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'billing.checkout.created',
      resourceType: 'stripe_checkout_session',
      resourceId: session.id,
      metadata: {
        customerId,
        plan,
      },
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude crear checkout.';
    await logErrorEvent({
      supabase: getSupabaseServiceClient(),
      request,
      action: 'billing.checkout.create',
      error,
      code: 'billing_checkout_failed',
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
