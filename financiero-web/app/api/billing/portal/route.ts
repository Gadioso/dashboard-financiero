import { NextResponse } from 'next/server';
import { getAppBaseUrl, getStripeClient } from '@/lib/stripe-server';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const supabase = getSupabaseServiceClient();

    if (!stripe) {
      return NextResponse.json({ success: false, error: 'Falta configurar STRIPE_SECRET_KEY.' }, { status: 500 });
    }

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('profile_id', tenant.profileId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ success: false, error: 'Todavía no hay cliente de Stripe para esta cuenta.' }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${getAppBaseUrl(request)}/`,
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude abrir el portal de facturación.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
