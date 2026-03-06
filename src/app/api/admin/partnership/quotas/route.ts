import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import { QUOTA_DEFAULTS } from '@/lib/instructor-quotas';

/**
 * GET /api/admin/partnership/quotas
 * Returns current default limits, overrides, and usage distributions (7d/30d).
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // 1. Current system_config limits
    let systemLimits = {
      email_invite_limit: QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT as number,
      token_creation_limit: QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT as number,
      adaptive_quotas: { enabled: false },
    };

    const { data: config } = await serviceSupabase
      .from('system_config')
      .select('value')
      .eq('key', 'instructor')
      .maybeSingle();

    if (config?.value) {
      const cfg = config.value as Record<string, unknown>;
      if (typeof cfg.email_invite_limit === 'number') {
        systemLimits.email_invite_limit = cfg.email_invite_limit;
      }
      if (typeof cfg.token_creation_limit === 'number') {
        systemLimits.token_creation_limit = cfg.token_creation_limit;
      }
      if (cfg.adaptive_quotas && typeof cfg.adaptive_quotas === 'object') {
        systemLimits.adaptive_quotas = cfg.adaptive_quotas as { enabled: boolean };
      }
    }

    // 2. Per-instructor overrides
    const { data: overrides } = await serviceSupabase
      .from('instructor_quota_overrides')
      .select('instructor_user_id, email_invite_limit, token_creation_limit, expires_at, note, created_at');

    const activeOverrides = (overrides || []).filter(
      (o: { expires_at: string | null }) => !o.expires_at || new Date(o.expires_at) > new Date()
    );

    // 3. Usage distribution (7d + 30d)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events7d } = await serviceSupabase
      .from('instructor_invite_events')
      .select('instructor_user_id, event_type')
      .gte('created_at', sevenDaysAgo);

    const { data: events30d } = await serviceSupabase
      .from('instructor_invite_events')
      .select('instructor_user_id, event_type')
      .gte('created_at', thirtyDaysAgo);

    // Compute per-instructor usage for percentile calculation
    function computeUsageDistribution(events: typeof events7d) {
      const usageByInstructor = new Map<string, { emails: number; tokens: number }>();
      for (const e of events || []) {
        const iid = e.instructor_user_id as string;
        if (!usageByInstructor.has(iid)) {
          usageByInstructor.set(iid, { emails: 0, tokens: 0 });
        }
        const entry = usageByInstructor.get(iid)!;
        if (e.event_type === 'email_sent') entry.emails++;
        if (e.event_type === 'token_created') entry.tokens++;
      }

      const emailCounts = [...usageByInstructor.values()].map(u => u.emails).sort((a, b) => a - b);
      const tokenCounts = [...usageByInstructor.values()].map(u => u.tokens).sort((a, b) => a - b);

      const percentile = (arr: number[], p: number) => {
        if (arr.length === 0) return 0;
        const idx = Math.ceil((p / 100) * arr.length) - 1;
        return arr[Math.max(0, idx)];
      };

      return {
        activeInstructors: usageByInstructor.size,
        emails: {
          p50: percentile(emailCounts, 50),
          p90: percentile(emailCounts, 90),
          p95: percentile(emailCounts, 95),
          max: emailCounts.length > 0 ? emailCounts[emailCounts.length - 1] : 0,
        },
        tokens: {
          p50: percentile(tokenCounts, 50),
          p90: percentile(tokenCounts, 90),
          p95: percentile(tokenCounts, 95),
          max: tokenCounts.length > 0 ? tokenCounts[tokenCounts.length - 1] : 0,
        },
      };
    }

    return NextResponse.json({
      defaults: {
        emailInviteLimit: systemLimits.email_invite_limit,
        tokenCreationLimit: systemLimits.token_creation_limit,
        adaptiveQuotas: systemLimits.adaptive_quotas,
        codeDefaults: {
          EMAIL_INVITE_LIMIT: QUOTA_DEFAULTS.EMAIL_INVITE_LIMIT,
          TOKEN_CREATION_LIMIT: QUOTA_DEFAULTS.TOKEN_CREATION_LIMIT,
        },
      },
      overrides: {
        active: activeOverrides.length,
        list: (activeOverrides || []).map((o: { instructor_user_id: string; email_invite_limit: number | null; token_creation_limit: number | null; expires_at: string | null; note: string | null }) => ({
          instructorId: (o.instructor_user_id as string).slice(0, 8),
          emailInviteLimit: o.email_invite_limit,
          tokenCreationLimit: o.token_creation_limit,
          expiresAt: o.expires_at,
          note: o.note,
        })),
      },
      usage7d: computeUsageDistribution(events7d),
      usage30d: computeUsageDistribution(events30d),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
