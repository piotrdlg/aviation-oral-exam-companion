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
      sessionsByStatusResult,
      recentSessionsResult,
      usageByProviderResult,
      averageUsageResult,
      topUsersResult,
    ] = await Promise.all([
      // DAU: users with last_login_at in last 24h
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_login_at', oneDayAgo),

      // WAU: users with last_login_at in last 7 days
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_login_at', sevenDaysAgo),

      // MAU: users with last_login_at in last 30 days
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_login_at', thirtyDaysAgo),

      // Total users
      serviceSupabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true }),

      // Sessions grouped by status (all time)
      serviceSupabase
        .from('exam_sessions')
        .select('status'),

      // Sessions in last 7 days
      serviceSupabase
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', sevenDaysAgo),

      // Per-provider usage (7-day rolling)
      serviceSupabase
        .from('usage_logs')
        .select('provider, event_type, quantity, status')
        .gte('created_at', sevenDaysAgo),

      // Average daily usage per user (last 7 days) — total quantity
      serviceSupabase
        .from('usage_logs')
        .select('user_id, quantity')
        .gte('created_at', sevenDaysAgo),

      // Top users by usage in last 7 days (for anomaly detection)
      serviceSupabase
        .from('usage_logs')
        .select('user_id, quantity')
        .gte('created_at', sevenDaysAgo),
    ]);

    // Aggregate session counts by status
    const sessionStatusCounts: Record<string, number> = {};
    if (sessionsByStatusResult.data) {
      for (const row of sessionsByStatusResult.data) {
        const status = row.status as string;
        sessionStatusCounts[status] = (sessionStatusCounts[status] || 0) + 1;
      }
    }

    // Aggregate provider usage
    const providerUsage: Record<string, { total_quantity: number; request_count: number; error_count: number }> = {};
    if (usageByProviderResult.data) {
      for (const row of usageByProviderResult.data) {
        const provider = row.provider as string;
        if (!providerUsage[provider]) {
          providerUsage[provider] = { total_quantity: 0, request_count: 0, error_count: 0 };
        }
        providerUsage[provider].total_quantity += row.quantity as number;
        providerUsage[provider].request_count += 1;
        if (row.status === 'error' || row.status === 'timeout') {
          providerUsage[provider].error_count += 1;
        }
      }
    }

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

    const anomalyUsers = userIds
      .filter((uid) => userUsageTotals[uid] > anomalyThreshold)
      .map((uid) => ({
        user_id: uid,
        total_usage: userUsageTotals[uid],
        ratio: averageUsage > 0 ? Math.round((userUsageTotals[uid] / averageUsage) * 100) / 100 : null,
      }))
      .sort((a, b) => b.total_usage - a.total_usage)
      .slice(0, 20); // Top 20 anomaly users

    return NextResponse.json({
      users: {
        total: totalUsersResult.count ?? 0,
        dau: dauResult.count ?? 0,
        wau: wauResult.count ?? 0,
        mau: mauResult.count ?? 0,
      },
      sessions: {
        by_status: sessionStatusCounts,
        last_7_days: recentSessionsResult.count ?? 0,
      },
      usage_7day: {
        by_provider: providerUsage,
        average_per_user: Math.round(averageUsage),
        total: totalUsage,
      },
      anomaly_users: anomalyUsers,
      generated_at: now.toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
