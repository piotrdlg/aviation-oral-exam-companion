import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isInstructorFeatureEnabled } from '@/lib/instructor-access';
import { createInviteLink } from '@/lib/instructor-invites';
import { checkInstructorRateLimit, logInviteEvent } from '@/lib/instructor-rate-limiter';
import { resolveEffectiveQuota, type QuotaSystemConfig, type QuotaOverride } from '@/lib/instructor-quotas';
import { sendInstructorInviteEmail } from '@/lib/email';
import { captureServerEvent, flushPostHog } from '@/lib/posthog-server';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple email format validation (RFC 5321 max length: 254)
function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/instructor/invites/email
 *
 * Send an invite email from an approved instructor to a prospective student.
 *
 * Body: { email: string; studentName?: string }
 *
 * Returns: { success: true; inviteId: string } on success.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth required
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Feature flag check
    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 3. Validate instructor is approved
    const { data: profile, error: profileError } = await serviceSupabase
      .from('instructor_profiles')
      .select('status, first_name, last_name, certificate_type')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Instructor profile not found' }, { status: 403 });
    }

    if (profile.status !== 'approved') {
      return NextResponse.json(
        { error: `Cannot send invites with status: ${profile.status}` },
        { status: 403 },
      );
    }

    // 4. Validate email input
    const body = await request.json();
    const { email, studentName } = body as { email?: string; studentName?: string };

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required (max 254 characters)' },
        { status: 400 },
      );
    }

    // 5. Resolve effective quota (includes per-instructor overrides + adaptive tiering)
    let effectiveEmailLimit: number | undefined;
    try {
      // Read system config
      const { data: sysConfig } = await serviceSupabase
        .from('system_config')
        .select('value')
        .eq('key', 'instructor')
        .maybeSingle();

      const quotaConfig: QuotaSystemConfig | null = sysConfig?.value
        ? (sysConfig.value as QuotaSystemConfig)
        : null;

      // Read per-instructor override
      const { data: overrideRow } = await serviceSupabase
        .from('instructor_quota_overrides')
        .select('email_invite_limit, token_creation_limit, expires_at, note')
        .eq('instructor_user_id', user.id)
        .maybeSingle();

      const override: QuotaOverride | null = overrideRow ? {
        emailInviteLimit: overrideRow.email_invite_limit as number | null,
        tokenCreationLimit: overrideRow.token_creation_limit as number | null,
        expiresAt: overrideRow.expires_at as string | null,
        note: overrideRow.note as string | null,
      } : null;

      // Count paid students for adaptive tiering
      const { data: paidConns } = await serviceSupabase
        .from('student_instructor_connections')
        .select('student_user_id')
        .eq('instructor_user_id', user.id)
        .eq('state', 'connected');

      let paidCount = 0;
      if (paidConns && paidConns.length > 0) {
        const studentIds = paidConns.map((c: { student_user_id: string }) => c.student_user_id);
        const { data: profiles } = await serviceSupabase
          .from('user_profiles')
          .select('subscription_status')
          .in('user_id', studentIds)
          .eq('subscription_status', 'active');
        paidCount = profiles?.length || 0;
      }

      const quota = resolveEffectiveQuota(paidCount, quotaConfig, override);
      effectiveEmailLimit = quota.emailInviteLimit;
    } catch {
      // Fall through to default rate limiter behavior
    }

    // 6. Check rate limit for 'email_sent'
    const rateCheck = await checkInstructorRateLimit(serviceSupabase, user.id, 'email_sent', effectiveEmailLimit);

    if (!rateCheck.allowed) {
      // Rate limited: log event, fire PostHog, return 429
      await logInviteEvent(serviceSupabase, user.id, 'rate_limited', {
        attempted_email: email,
        event_type_checked: 'email_sent',
        current: rateCheck.current,
        limit: rateCheck.limit,
      });

      captureServerEvent(user.id, 'instructor_invite_rate_limited', {
        event_type: 'email_sent',
        current: rateCheck.current,
        limit: rateCheck.limit,
      });

      await flushPostHog();

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          current: rateCheck.current,
          limit: rateCheck.limit,
          windowHours: rateCheck.windowHours,
        },
        { status: 429 },
      );
    }

    // 7. Create invite token
    const inviteResult = await createInviteLink(serviceSupabase, user.id, {
      targetEmail: email,
      targetName: studentName,
    });

    if (!inviteResult.success || !inviteResult.invite) {
      return NextResponse.json(
        { error: inviteResult.error || 'Failed to create invite' },
        { status: 400 },
      );
    }

    // 8. Log 'token_created' event
    await logInviteEvent(serviceSupabase, user.id, 'token_created', {
      invite_id: inviteResult.invite.id,
      target_email: email,
    });

    // 9. Send email
    const instructorName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(' ') || 'Your Instructor';

    const emailId = await sendInstructorInviteEmail(email, {
      instructorName,
      certType: (profile.certificate_type as string) || null,
      inviteUrl: inviteResult.invite.inviteUrl,
    });

    // 10. Log 'email_sent' event
    await logInviteEvent(serviceSupabase, user.id, 'email_sent', {
      invite_id: inviteResult.invite.id,
      target_email: email,
      resend_email_id: emailId,
    });

    // Fire PostHog event for successful invite
    captureServerEvent(user.id, 'instructor_invite_email_sent', {
      invite_id: inviteResult.invite.id,
      has_student_name: !!studentName,
    });

    await flushPostHog();

    // 11. Return success
    return NextResponse.json({
      success: true,
      inviteId: inviteResult.invite.id,
    });
  } catch (err) {
    console.error('[instructor-invite-email] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
