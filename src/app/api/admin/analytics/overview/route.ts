import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import {
  groupByDate,
  fillDateGaps,
  computeMRR,
  computeChurnRate,
  computeTrialConversion,
} from '@/lib/analytics-utils';

/**
 * GET /api/admin/analytics/overview
 *
 * Returns comprehensive analytics overview:
 * - Revenue: MRR, ARR, subscribers, trial conversion, churn
 * - Growth: total users, tier breakdown, signups per day (30d)
 * - Engagement: rating popularity, sessions per day, avg duration/exchanges
 * - Quality: error rate trend (14d), provider health (7d)
 * - Measurement health: PostHog, Stripe webhooks, GTM
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Date objects for fillDateGaps
    const thirtyDaysAgoDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgoDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Run all 14 queries in parallel
    const [
      monthlySubResult,
      annualSubResult,
      trialingResult,
      trialConvertedResult,
      totalTrialedResult,
      churnedResult,
      totalUsersResult,
      tierBreakdownResult,
      signupsResult,
      ratingPopularityResult,
      sessionsPerDayResult,
      avgDurationResult,
      errorRateTrendResult,
      providerHealthResult,
    ] = await Promise.all([
      // 1. Monthly subscriber count
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .in('subscription_status', ['active', 'trialing'])
        .eq('stripe_price_id', process.env.STRIPE_PRICE_MONTHLY!),

      // 2. Annual subscriber count
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .in('subscription_status', ['active', 'trialing'])
        .eq('stripe_price_id', process.env.STRIPE_PRICE_ANNUAL!),

      // 3. Trialing count
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('subscription_status', 'trialing'),

      // 4. Trial converted (trial_end in past + status active)
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .not('trial_end', 'is', null)
        .lt('trial_end', now.toISOString())
        .eq('subscription_status', 'active'),

      // 5. Total ever trialed
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .not('trial_end', 'is', null),

      // 6. Churned last 30d
      serviceSupabase
        .from('subscription_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'customer.subscription.deleted')
        .eq('status', 'processed')
        .gte('created_at', thirtyDaysAgo),

      // 7. Total users
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true }),

      // 8. Tier breakdown
      serviceSupabase
        .from('user_profiles')
        .select('tier'),

      // 9. Signups per day (30d)
      serviceSupabase
        .from('user_profiles')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo),

      // 10. Rating popularity (30d)
      serviceSupabase
        .from('exam_sessions')
        .select('rating')
        .gte('started_at', thirtyDaysAgo),

      // 11. Sessions per day (30d)
      serviceSupabase
        .from('exam_sessions')
        .select('started_at')
        .gte('started_at', thirtyDaysAgo),

      // 12. Avg duration + exchanges (30d, completed only)
      serviceSupabase
        .from('exam_sessions')
        .select('exchange_count, started_at, ended_at')
        .eq('status', 'completed')
        .gte('started_at', thirtyDaysAgo),

      // 13. Error rate trend (14d)
      serviceSupabase
        .from('usage_logs')
        .select('status, created_at')
        .gte('created_at', fourteenDaysAgo),

      // 14. Provider health (7d)
      serviceSupabase
        .from('usage_logs')
        .select('provider, status')
        .gte('created_at', sevenDaysAgo),
    ]);

    // --- Revenue ---
    const monthlyCount = monthlySubResult.count ?? 0;
    const annualCount = annualSubResult.count ?? 0;
    const trialingUsers = trialingResult.count ?? 0;
    const totalSubscribers = (monthlySubResult.count ?? 0) + (annualSubResult.count ?? 0);
    const trialConvertedCount = trialConvertedResult.count ?? 0;
    const trialTotalCount = totalTrialedResult.count ?? 0;
    const churnedLast30d = churnedResult.count ?? 0;

    const mrr = computeMRR(monthlyCount, annualCount);
    const arr = mrr * 12;
    const trialConversionRate = computeTrialConversion(trialConvertedCount, trialTotalCount);
    const churnRate = computeChurnRate(totalSubscribers, churnedLast30d);

    // --- Growth ---
    const totalUsers = totalUsersResult.count ?? 0;

    const tierCounts: Record<string, number> = { ground_school: 0, checkride_prep: 0, dpe_live: 0 };
    for (const row of tierBreakdownResult.data ?? []) {
      const tier = row.tier as string;
      if (tier in tierCounts) {
        tierCounts[tier] += 1;
      }
    }

    const signupBuckets = groupByDate(signupsResult.data ?? [], 'created_at');
    const signupsPerDay = fillDateGaps(signupBuckets, thirtyDaysAgoDate, 30);

    // --- Engagement ---
    const ratingBuckets: Record<string, number> = {};
    for (const row of ratingPopularityResult.data ?? []) {
      const rating = (row.rating as string) || 'unknown';
      ratingBuckets[rating] = (ratingBuckets[rating] || 0) + 1;
    }
    const ratingPopularity = Object.entries(ratingBuckets)
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => b.count - a.count);

    const sessionBuckets = groupByDate(sessionsPerDayResult.data ?? [], 'started_at');
    const sessionsPerDay = fillDateGaps(sessionBuckets, thirtyDaysAgoDate, 30);

    const completedSessions = avgDurationResult.data ?? [];
    let avgSessionDurationMin = 0;
    let avgExchangesPerSession = 0;
    if (completedSessions.length > 0) {
      const totalExchanges = completedSessions.reduce(
        (sum, s) => sum + ((s.exchange_count as number) || 0),
        0
      );
      avgExchangesPerSession = totalExchanges / completedSessions.length;

      const durations = completedSessions
        .filter((s) => s.ended_at)
        .map(
          (s) =>
            (new Date(s.ended_at as string).getTime() -
              new Date(s.started_at as string).getTime()) /
            60000
        );
      avgSessionDurationMin =
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    }

    // --- Quality: Error rate per day (14d) ---
    const errorLogsByDate: Record<string, { total: number; errors: number }> = {};
    for (const row of errorRateTrendResult.data ?? []) {
      const date = new Date(row.created_at as string).toISOString().slice(0, 10);
      if (!errorLogsByDate[date]) errorLogsByDate[date] = { total: 0, errors: 0 };
      errorLogsByDate[date].total += 1;
      if (row.status === 'error' || row.status === 'timeout') errorLogsByDate[date].errors += 1;
    }
    const errorRatePerDay = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(fourteenDaysAgoDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const bucket = errorLogsByDate[key] || { total: 0, errors: 0 };
      errorRatePerDay.push({
        date: key,
        total: bucket.total,
        errors: bucket.errors,
        rate: bucket.total > 0 ? bucket.errors / bucket.total : 0,
      });
    }

    // --- Quality: Provider health (7d) ---
    const providerBuckets: Record<string, { total: number; errors: number }> = {};
    for (const row of providerHealthResult.data ?? []) {
      const p = row.provider as string;
      if (!providerBuckets[p]) providerBuckets[p] = { total: 0, errors: 0 };
      providerBuckets[p].total += 1;
      if (row.status === 'error' || row.status === 'timeout') providerBuckets[p].errors += 1;
    }
    const providerHealth = Object.entries(providerBuckets).map(([provider, b]) => ({
      provider,
      total: b.total,
      errors: b.errors,
      rate: b.total > 0 ? b.errors / b.total : 0,
    }));

    // --- Stripe Webhook Health (separate query) ---
    const webhookResult = await serviceSupabase
      .from('subscription_events')
      .select('created_at, status')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    const webhookRows = webhookResult.data ?? [];
    const webhookFailed = webhookRows.filter((r) => r.status === 'failed').length;
    const webhookLastEvent = webhookRows.length > 0 ? (webhookRows[0].created_at as string) : null;

    let stripeWebhookStatus: 'ok' | 'warning' | 'error';
    let stripeWebhookMessage: string;
    if (webhookRows.length === 0) {
      stripeWebhookStatus = 'error';
      stripeWebhookMessage = 'No webhook events in last 7 days';
    } else if (webhookFailed > 0) {
      stripeWebhookStatus = 'warning';
      stripeWebhookMessage = `${webhookFailed} failed events out of ${webhookRows.length} in last 7 days`;
    } else {
      stripeWebhookStatus = 'ok';
      stripeWebhookMessage = `${webhookRows.length} events processed successfully in last 7 days`;
    }

    // --- PostHog Health ---
    let posthogHealth: {
      status: 'ok' | 'warning' | 'error' | 'unknown';
      lastEventAt: string | null;
      eventsLast24h: number;
      eventBreakdown: Array<{ event: string; count: number }>;
      message: string;
    } = {
      status: 'unknown',
      lastEventAt: null,
      eventsLast24h: 0,
      eventBreakdown: [],
      message: 'Not configured',
    };

    if (process.env.POSTHOG_PERSONAL_API_KEY) {
      try {
        const posthogResponse = await fetch(
          'https://us.posthog.com/api/projects/@current/query/',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: {
                kind: 'HogQLQuery',
                query: `SELECT event, count() as cnt, max(timestamp) as last_ts
                  FROM events
                  WHERE timestamp > now() - interval 24 hour
                  GROUP BY event
                  ORDER BY cnt DESC
                  LIMIT 20`,
              },
            }),
            signal: AbortSignal.timeout(5000),
          }
        );

        if (posthogResponse.ok) {
          const phData = await posthogResponse.json();
          // phData.results is array of [event_name, count, last_timestamp]
          const rows = phData.results || [];
          const totalEvents = rows.reduce(
            (sum: number, r: unknown[]) => sum + (r[1] as number),
            0
          );
          const latestTimestamp = rows.length > 0 ? (rows[0][2] as string) : null;
          const breakdown = rows.map((r: unknown[]) => ({
            event: r[0] as string,
            count: r[1] as number,
          }));

          const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

          posthogHealth = {
            status:
              totalEvents > 0 && latestTimestamp && latestTimestamp > oneHourAgo
                ? 'ok'
                : totalEvents > 0
                  ? 'warning'
                  : 'error',
            lastEventAt: latestTimestamp,
            eventsLast24h: totalEvents,
            eventBreakdown: breakdown,
            message:
              totalEvents > 0
                ? `${totalEvents} events in last 24h`
                : 'No events in last 24h',
          };
        } else {
          posthogHealth = {
            ...posthogHealth,
            status: 'unknown',
            message: `PostHog API returned ${posthogResponse.status}`,
          };
        }
      } catch (err) {
        posthogHealth = {
          ...posthogHealth,
          status: 'unknown',
          message: `PostHog API error: ${err instanceof Error ? err.message : 'unknown'}`,
        };
      }
    }

    // --- Build response ---
    return NextResponse.json({
      revenue: {
        mrr,
        arr,
        totalSubscribers,
        monthlySubscribers: monthlyCount,
        annualSubscribers: annualCount,
        trialingUsers,
        trialConversionRate,
        trialConvertedCount,
        trialTotalCount,
        churnRate,
        churnedLast30d,
      },
      growth: {
        totalUsers,
        tierBreakdown: {
          ground_school: tierCounts.ground_school,
          checkride_prep: tierCounts.checkride_prep,
          dpe_live: tierCounts.dpe_live,
        },
        signupsPerDay,
      },
      engagement: {
        ratingPopularity,
        sessionsPerDay,
        avgSessionDurationMin,
        avgExchangesPerSession,
      },
      quality: {
        errorRatePerDay,
        providerHealth,
      },
      measurementHealth: {
        posthog: posthogHealth,
        stripeWebhooks: {
          status: stripeWebhookStatus,
          lastEventAt: webhookLastEvent,
          eventsLast7d: webhookRows.length,
          failedLast7d: webhookFailed,
          message: stripeWebhookMessage,
        },
        gtm: {
          status: 'ok' as const,
          containerId: 'GTM-WZ5DFFK6',
          message: 'Container configured in root layout',
        },
      },
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
