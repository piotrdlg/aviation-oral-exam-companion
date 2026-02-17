import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { plan } = await request.json(); // 'monthly' | 'annual'
  const priceId = plan === 'annual' ? STRIPE_PRICES.annual : STRIPE_PRICES.monthly;

  if (!priceId) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Get or create Stripe customer
  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await serviceSupabase
      .from('user_profiles')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://heydpe.com';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id, // Links checkout to Supabase user for reliable webhook mapping
    metadata: { supabase_user_id: user.id }, // Searchable in Stripe Dashboard
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { supabase_user_id: user.id }, // Propagated to subscription object
    },
    success_url: `${baseUrl}/practice?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=canceled`,
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
  });

  return NextResponse.json({ url: session.url });
}
