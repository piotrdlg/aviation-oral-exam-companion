import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/dashboard
 *
 * Returns admin dashboard statistics:
 * - DAU / WAU / MAU (from user_profiles.last_login_at)
 * - Session counts by status
 * - Per-provider usage (7-day rolling window from usage_logs)
 * - Anomaly users (>5x average daily usage)
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel
    const [
      dauResult,
      wauResult,
      mauResult,
      totalUsersResult,
      activeSessionsResult,
      sessionsTodayResult,
      sessionsWeekResult,
      sessions7dResult,
      recentSessionsResult,
      usageByProviderResult,
      topUsersResult,
    ] = await Promise.all([
      // DAU
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_login_at', oneDayAgo),

      // WAU
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_login_at', sevenDaysAgo),

      // MAU
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_login_at', thirtyDaysAgo),

      // Total users
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true }),

      // Active sessions (status = 'active')
      serviceSupabase
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      // Sessions today
      serviceSupabase
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', oneDayAgo),

      // Sessions this week
      serviceSupabase
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', sevenDaysAgo),

      // Sessions in last 7 days (with exchange counts for avg calculation)
      serviceSupabase
        .from('exam_sessions')
        .select('exchange_count, started_at, ended_at')
        .gte('started_at', sevenDaysAgo),

      // Recent sessions (last 10) with user email via join
      serviceSupabase
        .from('exam_sessions')
        .select('id, user_id, rating, status, exchange_count, started_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(10),

      // Per-provider usage (7-day rolling)
      serviceSupabase
        .from('usage_logs')
        .select('provider, event_type, quantity, status, latency_ms')
        .gte('created_at', sevenDaysAgo),

      // Top users by usage in last 7 days (for anomaly detection)
      serviceSupabase
        .from('usage_logs')
        .select('user_id, quantity')
        .gte('created_at', sevenDaysAgo),
    ]);

    // Compute 7-day session averages
    let avgExchanges7d = 0;
    let avgDurationMin7d = 0;
    const sessions7d = sessions7dResult.data ?? [];
    if (sessions7d.length > 0) {
      const totalExchanges = sessions7d.reduce((sum, s) => sum + ((s.exchange_count as number) || 0), 0);
      avgExchanges7d = totalExchanges / sessions7d.length;

      const durations = sessions7d
        .filter((s) => s.ended_at)
        .map((s) => (new Date(s.ended_at as string).getTime() - new Date(s.started_at as string).getTime()) / 60000);
      avgDurationMin7d = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    }

    // Aggregate provider usage into costBreakdown array
    const providerBuckets: Record<string, { provider: string; event_type: string; request_count: number; total_quantity: number; avg_latency: number; error_count: number; latency_sum: number }> = {};
    if (usageByProviderResult.data) {
      for (const row of usageByProviderResult.data) {
        const key = `${row.provider}:${row.event_type}`;
        if (!providerBuckets[key]) {
          providerBuckets[key] = { provider: row.provider as string, event_type: row.event_type as string, request_count: 0, total_quantity: 0, avg_latency: 0, error_count: 0, latency_sum: 0 };
        }
        providerBuckets[key].request_count += 1;
        providerBuckets[key].total_quantity += (row.quantity as number) || 0;
        providerBuckets[key].latency_sum += (row.latency_ms as number) || 0;
        if (row.status === 'error' || row.status === 'timeout') {
          providerBuckets[key].error_count += 1;
        }
      }
    }
    const costBreakdown = Object.values(providerBuckets).map((b) => ({
      provider: b.provider,
      event_type: b.event_type,
      request_count: b.request_count,
      total_quantity: b.total_quantity,
      avg_latency: b.request_count > 0 ? Math.round(b.latency_sum / b.request_count) : 0,
      error_count: b.error_count,
    }));

    // Compute anomaly users (>5x average)
    const userUsageTotals: Record<string, number> = {};
    if (topUsersResult.data) {
      for (const row of topUsersResult.data) {
        const uid = row.user_id as string;
        userUsageTotals[uid] = (userUsageTotals[uid] || 0) + (row.quantity as number);
      }
    }

    const userIds = Object.keys(userUsageTotals);
    const totalUsage = Object.values(userUsageTotals).reduce((sum, v) => sum + v, 0);
    const averageUsage = userIds.length > 0 ? totalUsage / userIds.length : 0;
    const anomalyThreshold = averageUsage * 5;

    // Look up emails for anomaly users
    const anomalyUserIds = userIds
      .filter((uid) => userUsageTotals[uid] > anomalyThreshold)
      .sort((a, b) => userUsageTotals[b] - userUsageTotals[a])
      .slice(0, 20);

    let anomalyEmails: Record<string, string> = {};
    if (anomalyUserIds.length > 0) {
      const { data: authUsers } = await serviceSupabase.auth.admin.listUsers({ perPage: 100 });
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (anomalyUserIds.includes(u.id)) {
            anomalyEmails[u.id] = u.email || 'unknown';
          }
        }
      }
    }

    const anomalyUsers = anomalyUserIds.map((uid) => ({
      id: uid,
      email: anomalyEmails[uid] || uid.slice(0, 8) + '...',
      request_count: userUsageTotals[uid],
    }));

    // Look up emails for recent sessions
    const recentSessions: Array<{ id: string; user_email: string; rating: string; status: string; exchange_count: number; started_at: string; ended_at: string | null }> = [];
    if (recentSessionsResult.data && recentSessionsResult.data.length > 0) {
      const sessionUserIds = [...new Set(recentSessionsResult.data.map((s) => s.user_id as string))];
      const { data: authUsers } = await serviceSupabase.auth.admin.listUsers({ perPage: 100 });
      const emailMap: Record<string, string> = {};
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (sessionUserIds.includes(u.id)) {
            emailMap[u.id] = u.email || 'unknown';
          }
        }
      }
      for (const s of recentSessionsResult.data) {
        recentSessions.push({
          id: s.id as string,
          user_email: emailMap[s.user_id as string] || (s.user_id as string).slice(0, 8) + '...',
          rating: (s.rating as string) || 'private',
          status: s.status as string,
          exchange_count: (s.exchange_count as number) || 0,
          started_at: s.started_at as string,
          ended_at: (s.ended_at as string) || null,
        });
      }
    }

    return NextResponse.json({
      totalUsers: totalUsersResult.count ?? 0,
      dau: dauResult.count ?? 0,
      wau: wauResult.count ?? 0,
      mau: mauResult.count ?? 0,
      activeSessions: activeSessionsResult.count ?? 0,
      sessionsToday: sessionsTodayResult.count ?? 0,
      sessionsThisWeek: sessionsWeekResult.count ?? 0,
      avgExchanges7d,
      avgDurationMin7d,
      estDailyCost: 0,
      costBreakdown,
      anomalyUsers,
      recentSessions,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
