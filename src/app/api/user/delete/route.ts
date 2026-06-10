import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';
import { createHash } from 'crypto';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * W6.3 — account deletion (GDPR + the Apple in-app requirement the mobile
 * app will inherit). Order matters:
 *   1. type-to-confirm guard
 *   2. cancel any active Stripe subscription (immediate)
 *   3. explicit deletes for rows NOT keyed by a user FK:
 *      subscription_events (stripe ids), support_tickets/ticket_replies (PII)
 *   4. auth.admin.deleteUser → FK cascades wipe everything user-keyed
 *      (cascade map: migration 20260611000001)
 *   5. confirmation email + anonymized telemetry (sha256 of the user id)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'confirmation_required', detail: 'Send {"confirm":"DELETE"}' }, { status: 400 });
  }

  const userEmail = user.email;
  const userHash = createHash('sha256').update(user.id).digest('hex').slice(0, 16);

  // 2. Stripe: cancel any subscription so a deleted account is never billed
  const { data: profile } = await serviceSupabase
    .from('user_profiles')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(profile.stripe_subscription_id);
    } catch (err) {
      // Already-canceled is fine; anything else must not strand a paying sub
      const msg = err instanceof Error ? err.message : String(err);
      if (!/No such subscription|canceled/i.test(msg)) {
        console.error('[delete] Stripe cancel failed — aborting deletion:', msg);
        return NextResponse.json(
          { error: 'stripe_cancel_failed', detail: 'Subscription could not be cancelled. Contact support.' },
          { status: 502 }
        );
      }
    }
  }

  // 3. Explicit deletes (no user-FK cascade path)
  if (profile?.stripe_customer_id) {
    await serviceSupabase.from('subscription_events').delete().eq('customer_id', profile.stripe_customer_id);
  }
  const { data: tickets } = await serviceSupabase.from('support_tickets').select('id').eq('user_id', user.id);
  const ticketIds = (tickets ?? []).map((t) => t.id as string);
  if (ticketIds.length > 0) {
    await serviceSupabase.from('ticket_replies').delete().in('ticket_id', ticketIds);
    await serviceSupabase.from('support_tickets').delete().in('id', ticketIds);
  }

  // 4. The deletion — cascades cover the 34-table map (migration 20260611000001)
  const { error: delErr } = await serviceSupabase.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error('[delete] auth.admin.deleteUser failed:', delErr.message);
    return NextResponse.json({ error: 'deletion_failed', detail: delErr.message }, { status: 500 });
  }

  // 5. Confirmation + anonymized telemetry (fire-and-forget)
  try {
    const { sendAccountDeleted } = await import('@/lib/email');
    if (userEmail) void sendAccountDeleted(userEmail);
  } catch { /* non-critical */ }
  try {
    const { captureServerEvent, flushPostHog } = await import('@/lib/posthog-server');
    captureServerEvent(`deleted:${userHash}`, 'account_deleted', { had_subscription: !!profile?.stripe_subscription_id });
    await flushPostHog();
  } catch { /* non-critical */ }

  return NextResponse.json({ deleted: true });
}
