import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: try INSERT; on conflict check if already processed
  // Uses UNIQUE constraint on stripe_event_id; concurrent calls safely fail
  const { error: claimError } = await serviceSupabase
    .from('subscription_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      status: 'processing',
      payload: event.data.object as unknown as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (claimError) {
    // UNIQUE conflict — check if already successfully processed
    const { data: existing } = await serviceSupabase
      .from('subscription_events')
      .select('status')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existing?.status === 'processed') {
      return NextResponse.json({ received: true, deduplicated: true });
    }
    // status is 'processing' or 'failed' — previous attempt didn't finish; re-process below
  }

  try {
    // First attempt or retry of a failed/incomplete attempt
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;
    }

    // Mark event as successfully processed
    await serviceSupabase
      .from('subscription_events')
      .update({ status: 'processed' })
      .eq('stripe_event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    // Mark as failed so retries can re-process (not skip)
    await serviceSupabase
      .from('subscription_events')
      .update({ status: 'failed', error: String(err) })
      .eq('stripe_event_id', event.id);

    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
  if (session.mode !== 'subscription') return;

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const customerId = session.customer as string;

  // Find user by client_reference_id first (most reliable), fallback to stripe_customer_id
  let userId: string | null = session.client_reference_id ?? null;

  if (!userId) {
    // Fallback: lookup by Stripe customer ID
    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single();
    userId = profile?.user_id ?? null;
  }

  if (!userId) {
    // Throw so the event stays in 'failed' status and Stripe retries
    // (user mapping may succeed after auth flow completes)
    throw new Error(`No user found for Stripe customer: ${customerId}`);
  }

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: 'dpe_live',
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0]?.price.id,
      stripe_product_id: subscription.items.data[0]?.price.product as string,
      stripe_subscription_item_id: subscription.items.data[0]?.id,
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
        : null,
      latest_invoice_status: null,
      last_webhook_event_id: eventId,
      last_webhook_event_ts: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventId: string) {
  const customerId = subscription.customer as string;
  const eventTs = new Date().toISOString();

  const tier = subscription.status === 'active' || subscription.status === 'trialing'
    ? 'dpe_live'
    : 'checkride_prep';

  // Guard against out-of-order event delivery: only apply if no newer event was processed
  await serviceSupabase
    .from('user_profiles')
    .update({
      tier,
      subscription_status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      stripe_price_id: subscription.items.data[0]?.price.id,
      current_period_start: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
        : null,
      last_webhook_event_id: eventId,
      last_webhook_event_ts: eventTs,
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_webhook_event_ts.is.null,last_webhook_event_ts.lt.${eventTs}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string) {
  const customerId = subscription.customer as string;
  const eventTs = new Date().toISOString();

  // Guard against out-of-order event delivery
  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: 'checkride_prep',
      subscription_status: 'canceled',
      cancel_at_period_end: false,
      cancel_at: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      stripe_product_id: null,
      stripe_subscription_item_id: null,
      latest_invoice_status: null,
      last_webhook_event_id: eventId,
      last_webhook_event_ts: eventTs,
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_webhook_event_ts.is.null,last_webhook_event_ts.lt.${eventTs}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string) {
  const customerId = invoice.customer as string;
  const eventTs = new Date().toISOString();

  // Confirm payment succeeded — clears any previous 'failed' invoice status
  // and ensures tier is active even if subscription.updated arrives late
  const subscriptionId = invoice.parent?.subscription_details?.subscription as string | null;
  if (!subscriptionId) return; // one-off invoice, not subscription-related

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const tier = subscription.status === 'active' || subscription.status === 'trialing'
    ? 'dpe_live'
    : 'checkride_prep';

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier,
      subscription_status: subscription.status,
      latest_invoice_status: 'paid',
      last_webhook_event_id: eventId,
      last_webhook_event_ts: eventTs,
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_webhook_event_ts.is.null,last_webhook_event_ts.lt.${eventTs}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  const customerId = invoice.customer as string;
  const eventTs = new Date().toISOString();

  // Guard against out-of-order event delivery
  await serviceSupabase
    .from('user_profiles')
    .update({
      subscription_status: 'past_due',
      latest_invoice_status: 'failed',
      last_webhook_event_id: eventId,
      last_webhook_event_ts: eventTs,
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_webhook_event_ts.is.null,last_webhook_event_ts.lt.${eventTs}`);
}
