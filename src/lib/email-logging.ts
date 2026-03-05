import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { EmailCategory } from '@/types/database';
import { captureServerEvent } from '@/lib/posthog-server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;

function getServiceClient() {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Log an email send event to email_logs table + PostHog.
 * Non-blocking — never throws.
 */
export async function logEmailSent(params: {
  userId?: string;
  category: EmailCategory;
  templateId: string;
  resendId?: string;
  recipient: string;
  subject?: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getServiceClient();
    if (supabase) {
      await supabase.from('email_logs').insert({
        user_id: params.userId || null,
        category: params.category,
        template_id: params.templateId,
        resend_id: params.resendId || null,
        recipient: params.recipient,
        subject: params.subject || null,
        status: params.status,
        error: params.error || null,
        metadata: params.metadata || {},
      });
    }

    // PostHog event
    if (params.userId) {
      captureServerEvent(params.userId, 'email_sent', {
        category: params.category,
        template_id: params.templateId,
        status: params.status,
        recipient_domain: params.recipient.split('@')[1],
      });
    }
  } catch (err) {
    console.error('[email-logging] Failed to log email:', err);
  }
}

/**
 * Check when the last email of a given template was sent to a user.
 * Used for cadence enforcement (nudges, digests).
 */
export async function getLastEmailSentAt(
  userId: string,
  templateId: string,
): Promise<Date | null> {
  try {
    const supabase = getServiceClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from('email_logs')
      .select('sent_at')
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ? new Date(data.sent_at) : null;
  } catch {
    return null;
  }
}

/**
 * Get count of emails sent to a user in a given category within a time window.
 */
export async function getEmailCountSince(
  userId: string,
  category: EmailCategory,
  since: Date,
): Promise<number> {
  try {
    const supabase = getServiceClient();
    if (!supabase) return 0;

    const { count } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category', category)
      .eq('status', 'sent')
      .gte('sent_at', since.toISOString());

    return count ?? 0;
  } catch {
    return 0;
  }
}
