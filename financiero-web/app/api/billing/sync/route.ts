import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe-server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function stripeDate(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const supabase = getSupabaseServiceClient();
    if (!stripe || !supabase) return NextResponse.json({ success: false, error: 'La facturación no está disponible.' }, { status: 503 });

    const tenant = await getRequestTenantContext(request);
    if (!tenant.profileId) return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as { sessionId?: string };
    if (!body.sessionId?.startsWith('cs_')) return NextResponse.json({ success: false, error: 'Sesión de pago inválida.' }, { status: 400 });

    const session = await stripe.checkout.sessions.retrieve(body.sessionId);
    const sessionProfileId = session.client_reference_id || session.metadata?.profile_id || '';
    if (sessionProfileId !== tenant.profileId) return NextResponse.json({ success: false, error: 'La sesión no pertenece a esta cuenta.' }, { status: 403 });
    if (session.status !== 'complete' || session.payment_status === 'unpaid') return NextResponse.json({ success: false, error: 'El pago todavía no está confirmado.' }, { status: 409 });

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (!customerId || typeof session.subscription !== 'string') return NextResponse.json({ success: false, error: 'La suscripción todavía no está lista.' }, { status: 409 });

    const subscription = await stripe.subscriptions.retrieve(session.subscription) as Stripe.Subscription & { current_period_end?: number | null };
    const plan = session.metadata?.plan === 'beta' ? 'beta' : 'premium';
    const { error: customerError } = await supabase.from('billing_customers').upsert({
      profile_id: tenant.profileId,
      stripe_customer_id: customerId,
      email: tenant.email || session.customer_details?.email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'profile_id' });
    if (customerError) throw customerError;

    const { error: subscriptionError } = await supabase.from('billing_subscriptions').upsert({
      profile_id: tenant.profileId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      plan,
      price_id: subscription.items.data[0]?.price?.id || null,
      current_period_end: stripeDate(subscription.current_period_end || null),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      trial_end: stripeDate(subscription.trial_end),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' });
    if (subscriptionError) throw subscriptionError;

    return NextResponse.json({ success: true, plan, status: subscription.status });
  } catch {
    return NextResponse.json({ success: false, error: 'No pude confirmar la suscripción. Intenta actualizar la página.' }, { status: 500 });
  }
}
