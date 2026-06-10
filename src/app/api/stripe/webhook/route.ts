import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  sendSubscriptionConfirmed,
  sendSubscriptionCancelled,
  sendPaymentFailed,
  sendTrialEndingReminder,
  sendInternalAlert,
} from '@/lib/email';
import { mapStripePriceToTier, tierForSubscription } from '@/lib/stripe-tier';
import { invalidateTierCache } from '@/lib/voice/tier-lookup';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** ISO string of the Stripe event's creation time (epoch seconds → ms). */
function eventCreatedIso(event: Stripe.Event): string {
  return new Date(event.created * 1000).toISOString();
}

export async function POST(request: NextRequest) {
  after(async () => {
    const { flushPostHog } = await import('@/lib/posthog-server');
    await flushPostHog();
  });

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: try INSERT; on conflict inspect the existing row.
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
    const { data: existing } = await serviceSupabase
      .from('subscription_events')
      .select('status, created_at')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existing?.status === 'processed') {
      return NextResponse.json({ received: true, deduplicated: true });
    }
    // Concurrent duplicate delivery: another request is processing this same
    // event right now. Don't double-process (review-05 #15) — only re-process
    // if the prior attempt is stale (>60s) or already failed.
    if (existing?.status === 'processing' && existing.created_at) {
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs < 60_000) {
        return NextResponse.json({ received: true, in_flight: true });
      }
    }
    // status is 'failed', or a stale 'processing' — fall through and re-process.
  }

  const createdIso = eventCreatedIso(event);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id, createdIso);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id, createdIso);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id, createdIso);
        break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, event.id, createdIso);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice, event.id, createdIso);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge, createdIso);
        break;
      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute, createdIso);
        break;
    }

    await serviceSupabase
      .from('subscription_events')
      .update({ status: 'processed' })
      .eq('stripe_event_id', event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    await serviceSupabase
      .from('subscription_events')
      .update({ status: 'failed', error: String(err) })
      .eq('stripe_event_id', event.id);

    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string, createdIso: string) {
  if (session.mode !== 'subscription') return;

  const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
  const customerId = session.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Find user by client_reference_id first (most reliable), fallback to stripe_customer_id
  let userId: string | null = session.client_reference_id ?? null;

  if (!userId) {
    const { data: profile } = await serviceSupabase
      .from('user_profiles')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single();
    userId = profile?.user_id ?? null;
  }

  if (!userId) {
    // Throw so the event stays in 'failed' status and Stripe retries
    throw new Error(`No user found for Stripe customer: ${customerId}`);
  }

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: tierForSubscription(subscription.status, priceId),
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      stripe_product_id: subscription.items.data[0]?.price.product as string,
      stripe_subscription_item_id: subscription.items.data[0]?.id,
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      ...(subscription.trial_end ? { has_trialed: true } : {}),
      current_period_start: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
        : null,
      latest_invoice_status: null,
      last_webhook_event_id: eventId,
      last_stripe_event_created: createdIso,
    })
    .eq('user_id', userId);

  invalidateTierCache(userId); // W3.3 #4 (best-effort; 5-min TTL covers other instances)

  // Fire GA4 server-side purchase event for reliable revenue tracking
  if (process.env.GA4_API_SECRET && process.env.GA4_MEASUREMENT_ID) {
    try {
      const price = subscription.items.data[0]?.price;
      const amount = (session.amount_total ?? 0) / 100;
      const planName = price?.recurring?.interval === 'year' ? 'Annual' : 'Monthly';

      await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${process.env.GA4_MEASUREMENT_ID}&api_secret=${process.env.GA4_API_SECRET}`,
        {
          method: 'POST',
          body: JSON.stringify({
            client_id: userId,
            events: [{
              name: 'purchase',
              params: {
                transaction_id: session.id,
                value: amount,
                currency: session.currency?.toUpperCase() || 'USD',
                items: [{ item_name: `HeyDPE ${planName}` }],
              },
            }],
          }),
        }
      );
    } catch (err) {
      console.error('GA4 Measurement Protocol error:', err);
    }
  }

  // Launch funnel: checkout completed (Phase 18)
  try {
    const { captureServerEvent } = await import('@/lib/posthog-server');
    const price = subscription.items.data[0]?.price;
    captureServerEvent(userId, 'checkout_completed', {
      plan: price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
      amount: (session.amount_total ?? 0) / 100,
      currency: session.currency?.toUpperCase() || 'USD',
      subscription_id: subscription.id,
      is_trial: subscription.status === 'trialing',
    });
  } catch {
    // Non-critical
  }

  // Send confirmation email
  const customerEmail = session.customer_details?.email || session.customer_email;
  if (customerEmail) {
    const plan = priceId === process.env.STRIPE_PRICE_ANNUAL ? 'annual' as const : 'monthly' as const;
    void sendSubscriptionConfirmed(customerEmail, plan);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventId: string, createdIso: string) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Dunning grace (review-05 #8): past_due keeps the paid tier; only terminal
  // statuses downgrade. tierForSubscription() encodes that policy.
  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: tierForSubscription(subscription.status, priceId),
      subscription_status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      stripe_price_id: priceId,
      ...(subscription.trial_end ? { has_trialed: true } : {}),
      current_period_start: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString()
        : null,
      current_period_end: subscription.items.data[0]
        ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
        : null,
      last_webhook_event_id: eventId,
      last_stripe_event_created: createdIso,
    })
    .eq('stripe_customer_id', customerId)
    // Out-of-order guard (review-05 #5): apply only if this event is newer.
    .or(`last_stripe_event_created.is.null,last_stripe_event_created.lt.${createdIso}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string, createdIso: string) {
  const customerId = subscription.customer as string;

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
      last_stripe_event_created: createdIso,
      // has_trialed and stripe_customer_id are intentionally preserved.
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_stripe_event_created.is.null,last_stripe_event_created.lt.${createdIso}`);

  // Send cancellation email
  const { data: cancelProfile } = await serviceSupabase
    .from('user_profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  if (cancelProfile?.user_id) {
    invalidateTierCache(cancelProfile.user_id); // W3.3 #4
    const { data: { user: cancelUser } } = await serviceSupabase.auth.admin.getUserById(cancelProfile.user_id);
    if (cancelUser?.email) {
      void sendSubscriptionCancelled(cancelUser.email);
    }
  }
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  // Pre-charge notice (review-05 #10): Stripe fires this ~3 days before the
  // trial converts. The pricing FAQ promises this reminder. Transactional —
  // sent regardless of marketing email preferences.
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId === process.env.STRIPE_PRICE_ANNUAL ? 'annual' as const : 'monthly' as const;

  const daysLeft = subscription.trial_end
    ? Math.max(1, Math.ceil((subscription.trial_end * 1000 - Date.now()) / 86_400_000))
    : 3;

  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('user_id, display_name')
    .eq('stripe_customer_id', customerId)
    .single();
  if (!profile?.user_id) return;

  const { data: { user } } = await serviceSupabase.auth.admin.getUserById(profile.user_id);
  if (user?.email) {
    void sendTrialEndingReminder(user.email, daysLeft, plan, profile.display_name ?? undefined);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string, createdIso: string) {
  const customerId = invoice.customer as string;

  const subscriptionId = invoice.parent?.subscription_details?.subscription as string | null;
  if (!subscriptionId) return; // one-off invoice, not subscription-related

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;

  await serviceSupabase
    .from('user_profiles')
    .update({
      tier: tierForSubscription(subscription.status, priceId),
      subscription_status: subscription.status,
      latest_invoice_status: 'paid',
      ...(subscription.trial_end ? { has_trialed: true } : {}),
      last_webhook_event_id: eventId,
      last_stripe_event_created: createdIso,
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_stripe_event_created.is.null,last_stripe_event_created.lt.${createdIso}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice, eventId: string, createdIso: string) {
  const customerId = invoice.customer as string;

  // Dunning grace (review-05 #8): a failed renewal does NOT downgrade the
  // tier. Stripe retries for ~2 weeks; access is revoked only on
  // subscription.deleted / unpaid. We mark past_due and notify.
  await serviceSupabase
    .from('user_profiles')
    .update({
      subscription_status: 'past_due',
      latest_invoice_status: 'failed',
      last_webhook_event_id: eventId,
      last_stripe_event_created: createdIso,
    })
    .eq('stripe_customer_id', customerId)
    .or(`last_stripe_event_created.is.null,last_stripe_event_created.lt.${createdIso}`);

  // Send payment failed email
  const { data: failProfile } = await serviceSupabase
    .from('user_profiles')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  if (failProfile?.user_id) {
    invalidateTierCache(failProfile.user_id); // W3.3 #4 (status change, though tier kept in grace)
    const { data: { user: failUser } } = await serviceSupabase.auth.admin.getUserById(failProfile.user_id);
    if (failUser?.email) {
      void sendPaymentFailed(failUser.email);
    }
  }
}

async function handleChargeRefunded(charge: Stripe.Charge, createdIso: string) {
  // review-05 #7: alert the owner; revoke access on a FULL refund (a partial
  // refund leaves the subscription intact, so we only alert).
  const customerId = charge.customer as string | null;
  const fullRefund = (charge.amount_refunded ?? 0) >= (charge.amount ?? 0) && (charge.amount ?? 0) > 0;

  void sendInternalAlert('Charge refunded', [
    `Charge: ${charge.id}`,
    `Customer: ${customerId ?? '(none)'}`,
    `Amount: ${(charge.amount ?? 0) / 100} ${charge.currency?.toUpperCase()}`,
    `Refunded: ${(charge.amount_refunded ?? 0) / 100} (${fullRefund ? 'FULL' : 'partial'})`,
    fullRefund
      ? 'Action: tier downgraded NOW — but if the subscription is still ACTIVE, the next subscription event will restore it. CANCEL the subscription in the Stripe dashboard to make it stick.'
      : 'Action: none (partial refund) — review manually.',
  ]);

  if (fullRefund && customerId) {
    await serviceSupabase
      .from('user_profiles')
      .update({
        tier: 'checkride_prep',
        latest_invoice_status: 'refunded',
        last_stripe_event_created: createdIso,
      })
      .eq('stripe_customer_id', customerId)
      .or(`last_stripe_event_created.is.null,last_stripe_event_created.lt.${createdIso}`);
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute, createdIso: string) {
  // review-05 #7: a chargeback is serious — alert and revoke access.
  let customerId: string | null = null;
  try {
    const charge = await getStripe().charges.retrieve(dispute.charge as string);
    customerId = charge.customer as string | null;
  } catch (err) {
    console.error('[stripe] dispute charge lookup failed:', err);
  }

  void sendInternalAlert('Payment dispute opened', [
    `Dispute: ${dispute.id}`,
    `Charge: ${dispute.charge}`,
    `Customer: ${customerId ?? '(unknown)'}`,
    `Amount: ${(dispute.amount ?? 0) / 100} ${dispute.currency?.toUpperCase()}`,
    `Reason: ${dispute.reason}`,
    'Action: tier downgraded NOW — respond to the dispute in the Stripe dashboard, and cancel the subscription if appropriate (a later subscription event can otherwise restore the tier).',
  ]);

  if (customerId) {
    await serviceSupabase
      .from('user_profiles')
      .update({
        tier: 'checkride_prep',
        subscription_status: 'unpaid',
        latest_invoice_status: 'disputed',
        last_stripe_event_created: createdIso,
      })
      .eq('stripe_customer_id', customerId)
      .or(`last_stripe_event_created.is.null,last_stripe_event_created.lt.${createdIso}`);
  }
}
