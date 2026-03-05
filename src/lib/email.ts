import { Resend } from 'resend';
import { WelcomeEmail } from '@/emails/welcome';
import { SubscriptionConfirmedEmail } from '@/emails/subscription-confirmed';
import { SubscriptionCancelledEmail } from '@/emails/subscription-cancelled';
import { PaymentFailedEmail } from '@/emails/payment-failed';
import { TrialEndingEmail } from '@/emails/trial-ending';
import { TicketAutoReplyEmail } from '@/emails/ticket-auto-reply';
import { LearningDigestEmail } from '@/emails/learning-digest';
import { MotivationNudgeEmail } from '@/emails/motivation-nudge';
import type { DigestData } from '@/lib/digest-builder';
import type { NudgeVariant } from '@/lib/nudge-engine';

// Lazy-initialize Resend client to avoid build-time errors when env vars are unavailable
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const SENDERS = {
  hello: 'HeyDPE <hello@heydpe.com>',
  billing: 'HeyDPE Billing <billing@heydpe.com>',
  support: 'HeyDPE Support <support@heydpe.com>',
  noreply: 'HeyDPE <noreply@heydpe.com>',
} as const;

/**
 * Send the welcome email to a new user.
 * Never throws — logs errors and returns silently.
 */
export async function sendWelcomeEmail(
  to: string,
  name?: string
): Promise<void> {
  try {
    await getResend().emails.send({
      from: SENDERS.hello,
      to,
      subject: 'Welcome to HeyDPE \u2014 Your DPE is ready',
      react: WelcomeEmail({ name }),
    });
  } catch (error) {
    console.error('[email] Failed to send welcome email:', error);
  }
}

/**
 * Send subscription confirmation email.
 * Never throws — logs errors and returns silently.
 */
export async function sendSubscriptionConfirmed(
  to: string,
  plan: 'monthly' | 'annual'
): Promise<void> {
  try {
    await getResend().emails.send({
      from: SENDERS.billing,
      to,
      subject: 'Your HeyDPE subscription is active',
      react: SubscriptionConfirmedEmail({ plan }),
    });
  } catch (error) {
    console.error(
      '[email] Failed to send subscription confirmed email:',
      error
    );
  }
}

/**
 * Send subscription cancellation email.
 * Never throws — logs errors and returns silently.
 */
export async function sendSubscriptionCancelled(to: string): Promise<void> {
  try {
    await getResend().emails.send({
      from: SENDERS.billing,
      to,
      subject: 'Your HeyDPE subscription has been cancelled',
      react: SubscriptionCancelledEmail(),
    });
  } catch (error) {
    console.error(
      '[email] Failed to send subscription cancelled email:',
      error
    );
  }
}

/**
 * Send payment failure notification email.
 * Never throws — logs errors and returns silently.
 */
export async function sendPaymentFailed(to: string): Promise<void> {
  try {
    await getResend().emails.send({
      from: SENDERS.billing,
      to,
      subject: 'Action needed \u2014 Payment failed for HeyDPE',
      react: PaymentFailedEmail(),
    });
  } catch (error) {
    console.error('[email] Failed to send payment failed email:', error);
  }
}

/**
 * Send trial ending soon reminder email.
 * Never throws — logs errors and returns silently.
 */
export async function sendTrialEndingReminder(
  to: string,
  daysLeft: number,
  plan: 'monthly' | 'annual',
  name?: string
): Promise<void> {
  try {
    await getResend().emails.send({
      from: SENDERS.billing,
      to,
      subject: `Your HeyDPE trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      react: TrialEndingEmail({ name, daysLeft, plan }),
    });
  } catch (error) {
    console.error('[email] Failed to send trial ending reminder:', error);
  }
}

/**
 * Send a support ticket reply email.
 * Sets In-Reply-To and References headers when inReplyTo is provided
 * for proper email threading.
 *
 * Returns the Resend email ID on success, or null on error.
 * Never throws — logs errors and returns null.
 */
export async function sendTicketReply(
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {};
    if (inReplyTo) {
      headers['In-Reply-To'] = inReplyTo;
      headers['References'] = inReplyTo;
    }

    const { data, error } = await getResend().emails.send({
      from: SENDERS.support,
      to,
      subject: `Re: ${subject}`,
      text: body,
      headers,
    });

    if (error) {
      console.error('[email] Resend API error sending ticket reply:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.error('[email] Failed to send ticket reply:', error);
    return null;
  }
}

/**
 * Send an auto-reply confirming receipt of a support ticket.
 * Never throws — logs errors and returns silently.
 */
export async function sendTicketAutoReply(
  to: string,
  subject?: string
): Promise<void> {
  try {
    await getResend().emails.send({
      from: SENDERS.support,
      to,
      subject: 'We received your message — HeyDPE Support',
      react: TicketAutoReplyEmail({ subject }),
    });
  } catch (error) {
    console.error('[email] Failed to send ticket auto-reply:', error);
  }
}

/**
 * Forward an inbound email to the configured forwarding address.
 * Sets X-Original-From and X-Original-To headers for traceability.
 * Never throws — logs errors and returns silently.
 */
export async function forwardEmail(
  originalFrom: string,
  originalTo: string,
  subject: string,
  bodyText: string,
  bodyHtml?: string
): Promise<void> {
  const forwardTo = process.env.EMAIL_FORWARD_TO;
  if (!forwardTo) {
    console.error('[email] EMAIL_FORWARD_TO not configured, cannot forward');
    return;
  }

  try {
    await getResend().emails.send({
      from: SENDERS.noreply,
      to: forwardTo,
      subject: `[Fwd] ${subject}`,
      html:
        bodyHtml ??
        `<p><strong>Forwarded message from ${originalFrom}</strong></p><hr/><pre>${bodyText}</pre>`,
      text: `--- Forwarded message from ${originalFrom} ---\n\n${bodyText}`,
      headers: {
        'X-Original-From': originalFrom,
        'X-Original-To': originalTo,
      },
    });
  } catch (error) {
    console.error('[email] Failed to forward email:', error);
  }
}

/**
 * Send a daily learning digest email.
 * Returns the Resend email ID on success, or null on error.
 * Never throws — logs errors and returns null.
 */
export async function sendLearningDigest(
  to: string,
  digestData: DigestData,
): Promise<string | null> {
  try {
    const { data, error } = await getResend().emails.send({
      from: SENDERS.hello,
      to,
      subject: `Your HeyDPE study briefing — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      react: LearningDigestEmail(digestData),
      headers: {
        'List-Unsubscribe': `<${digestData.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (error) {
      console.error('[email] Resend error sending digest:', error);
      return null;
    }
    return data?.id ?? null;
  } catch (error) {
    console.error('[email] Failed to send learning digest:', error);
    return null;
  }
}

/**
 * Send a motivation nudge email to an inactive user.
 * Returns the Resend email ID on success, or null on error.
 * Never throws — logs errors and returns null.
 */
export async function sendMotivationNudge(
  to: string,
  opts: {
    name?: string;
    variant: NudgeVariant;
    heading: string;
    body: string;
    ctaText: string;
    subject: string;
    daysSinceLastSession: number;
    totalSessions: number;
    unsubscribeUrl: string;
  },
): Promise<string | null> {
  try {
    const { data, error } = await getResend().emails.send({
      from: SENDERS.hello,
      to,
      subject: opts.subject,
      react: MotivationNudgeEmail({
        name: opts.name,
        heading: opts.heading,
        body: opts.body,
        ctaText: opts.ctaText,
        daysSinceLastSession: opts.daysSinceLastSession,
        totalSessions: opts.totalSessions,
        unsubscribeUrl: opts.unsubscribeUrl,
      }),
      headers: {
        'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (error) {
      console.error('[email] Resend error sending motivation nudge:', error);
      return null;
    }
    return data?.id ?? null;
  } catch (error) {
    console.error('[email] Failed to send motivation nudge:', error);
    return null;
  }
}
