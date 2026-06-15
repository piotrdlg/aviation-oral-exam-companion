import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
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
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // W3.4 / decision D3: collect tax automatically. Stripe REJECTS session
      // creation with automatic_tax until the account has a tax registration/
      // origin address, so this is gated on STRIPE_TAX_ENABLED — set it in
      // Vercel ONLY AFTER completing Stripe Tax registration in the dashboard.
      // (Review correction: the unconditional version would have broken every
      // checkout the moment it deployed, ahead of the manual prerequisite.)
      ...(process.env.STRIPE_TAX_ENABLED === 'true'
        ? {
            automatic_tax: { enabled: true },
            // name: 'auto' is REQUIRED by Stripe when tax_id_collection is
            // used with an existing customer (otherwise session creation errors).
            customer_update: { address: 'auto' as const, name: 'auto' as const },
            tax_id_collection: { enabled: true },
          }
        : {}),
      // No Stripe trial: the free 7-day / 3-exam trial happens app-side (free
      // tier, no card). Paid checkout bills the first month/year immediately.
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      custom_text: {
        submit: {
          message: 'Subscribe to HeyDPE. Cancel anytime \u2014 no questions asked.',
        },
        after_submit: {
          message: 'Welcome to HeyDPE! Your practice sessions are ready.',
        },
      },
      success_url: `${baseUrl}/practice?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    const message = error instanceof Error ? error.message : 'Checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
