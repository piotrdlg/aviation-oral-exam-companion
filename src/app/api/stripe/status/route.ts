import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('tier, subscription_status, stripe_customer_id, cancel_at, cancel_at_period_end, current_period_end')
      .eq('user_id', user.id)
      .single();

    // If webhook already processed, return current state
    if (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing') {
      return NextResponse.json({
        tier: profile.tier,
        status: profile.subscription_status,
        cancelAt: profile.cancel_at,
        cancelAtPeriodEnd: profile.cancel_at_period_end,
        currentPeriodEnd: profile.current_period_end,
      });
    }

    // Webhook may not have fired yet — check Stripe directly
    if (profile?.stripe_customer_id) {
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'all',
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0];
        if (sub.status === 'active' || sub.status === 'trialing') {
          // Grant entitlement immediately
          await serviceSupabase
            .from('user_profiles')
            .update({
              tier: 'dpe_live',
              subscription_status: sub.status,
              stripe_subscription_id: sub.id,
              stripe_price_id: sub.items.data[0]?.price.id,
              current_period_start: sub.items.data[0]
                ? new Date(sub.items.data[0].current_period_start * 1000).toISOString()
                : null,
              current_period_end: sub.items.data[0]
                ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
                : null,
            })
            .eq('user_id', user.id);

          return NextResponse.json({ tier: 'dpe_live', status: sub.status });
        }
      }
    }

    return NextResponse.json({ tier: profile?.tier ?? 'ground_school', status: 'free' });
  } catch (error) {
    console.error('Stripe status error:', error);
    const message = error instanceof Error ? error.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
