import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/admin/quality/email-health
 *
 * Returns email system health metrics:
 * - Preference stats (opt-out rates per category)
 * - Email volume over last 7 days (by category, status, template)
 * - Recent failures (last 10)
 * - Today's digest and nudge stats
 *
 * Phase 20 — Email Monitoring
 */

// Service role client for untyped tables (same pattern as email-logging.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OPTIONAL_CATEGORIES = [
  'learning_digest',
  'motivation_nudges',
  'product_updates',
  'marketing',
] as const;

export async function GET(request: NextRequest) {
  try {
    // Admin auth check (uses its own service client internally)
    await requireAdmin(request);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    // ── 1. Preference stats ──────────────────────────────────────

    // Total distinct users with any preference row
    const { data: prefUsers } = await supabase
      .from('email_preferences')
      .select('user_id');

    const uniqueUserIds = new Set<string>(
      (prefUsers || []).map((r: { user_id: string }) => r.user_id),
    );
    const totalUsersWithPrefs = uniqueUserIds.size;

    // Opt-out rates per optional category
    const optOutRates: Record<
      string,
      { total: number; optedOut: number; rate: number }
    > = {};

    for (const category of OPTIONAL_CATEGORIES) {
      const { data: catRows } = await supabase
        .from('email_preferences')
        .select('enabled')
        .eq('category', category);

      const total = catRows?.length ?? 0;
      const optedOut = (catRows || []).filter(
        (r: { enabled: boolean }) => !r.enabled,
      ).length;

      optOutRates[category] = {
        total,
        optedOut,
        rate: total > 0 ? Math.round((optedOut / total) * 1000) / 1000 : 0,
      };
    }

    // ── 2. Email volume (last 7 days) ───────────────────────────

    const { data: recentLogs } = await supabase
      .from('email_logs')
      .select('category, status, template_id')
      .gte('sent_at', sevenDaysAgo.toISOString());

    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byTemplate: Record<string, number> = {};

    for (const log of recentLogs || []) {
      const cat = log.category as string;
      const st = log.status as string;
      const tpl = log.template_id as string;

      byCategory[cat] = (byCategory[cat] || 0) + 1;
      byStatus[st] = (byStatus[st] || 0) + 1;
      byTemplate[tpl] = (byTemplate[tpl] || 0) + 1;
    }

    // ── 3. Recent failures ──────────────────────────────────────

    const { data: failures } = await supabase
      .from('email_logs')
      .select('template_id, recipient, error, sent_at')
      .eq('status', 'failed')
      .order('sent_at', { ascending: false })
      .limit(10);

    const recentFailures = (failures || []).map(
      (f: {
        template_id: string;
        recipient: string;
        error: string | null;
        sent_at: string;
      }) => ({
        template_id: f.template_id,
        recipient_domain: f.recipient.includes('@')
          ? f.recipient.split('@')[1]
          : 'unknown',
        error: f.error,
        sent_at: f.sent_at,
      }),
    );

    // ── 4. Today's digest / nudge stats ─────────────────────────

    const { data: todayLogs } = await supabase
      .from('email_logs')
      .select('category, template_id, status')
      .gte('sent_at', todayStart.toISOString())
      .eq('status', 'sent');

    let digestsSent = 0;
    let nudgesSent = 0;
    const nudgeVariants: Record<string, number> = {};

    for (const log of todayLogs || []) {
      const cat = log.category as string;
      const tpl = log.template_id as string;

      if (cat === 'learning_digest') {
        digestsSent++;
      }
      if (cat === 'motivation_nudges') {
        nudgesSent++;
        // Extract variant from template_id like "motivation-nudge-day_1"
        const variantMatch = tpl.match(/day_\d+/);
        if (variantMatch) {
          const variant = variantMatch[0];
          nudgeVariants[variant] = (nudgeVariants[variant] || 0) + 1;
        }
      }
    }

    // ── Response ────────────────────────────────────────────────

    return NextResponse.json({
      generatedAt: now.toISOString(),
      preferences: {
        totalUsersWithPrefs,
        optOutRates,
      },
      volume: {
        last7Days: {
          byCategory,
          byStatus,
          byTemplate,
        },
      },
      recentFailures,
      today: {
        digestsSent,
        nudgesSent,
        nudgeVariants,
      },
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
