import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/referrals
 *
 * Returns referral and connection source metrics:
 * - Connections grouped by source
 * - Referral code & slug coverage among approved instructors
 * - Top referrers by referral_link connections
 * - Recent referral claims (last 7 days)
 * - Conversion metrics
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // 1. Connections by source
    const { data: connRows } = await serviceSupabase
      .from('student_instructor_connections')
      .select('connection_source');

    const connectionsBySource: Record<string, number> = {};
    for (const row of connRows || []) {
      const src = (row.connection_source as string) || 'unknown';
      connectionsBySource[src] = (connectionsBySource[src] || 0) + 1;
    }

    // 2. Referral code + slug coverage among approved instructors
    const { data: approvedInstructors } = await serviceSupabase
      .from('instructor_profiles')
      .select('referral_code, slug')
      .eq('status', 'approved');

    const totalApproved = approvedInstructors?.length || 0;
    const withReferralCode = approvedInstructors?.filter(r => r.referral_code).length || 0;
    const withSlug = approvedInstructors?.filter(r => r.slug).length || 0;

    // 3. Top referrers (by referral_link connections)
    const { data: referralConns } = await serviceSupabase
      .from('student_instructor_connections')
      .select('instructor_user_id')
      .eq('connection_source', 'referral_link');

    const referrerCounts = new Map<string, number>();
    for (const r of referralConns || []) {
      const uid = r.instructor_user_id as string;
      referrerCounts.set(uid, (referrerCounts.get(uid) || 0) + 1);
    }
    const topReferrers = [...referrerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => ({ instructorId: uid.slice(0, 8) + '...', count }));

    // 4. Recent claims (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentClaimCount } = await serviceSupabase
      .from('student_instructor_connections')
      .select('id', { count: 'exact', head: true })
      .eq('connection_source', 'referral_link')
      .gte('connected_at', sevenDaysAgo);

    return NextResponse.json({
      connectionsBySource,
      identityCoverage: {
        totalApproved,
        withReferralCode,
        withSlug,
        referralCodePct: totalApproved > 0 ? Math.round(withReferralCode / totalApproved * 100) : 0,
        slugPct: totalApproved > 0 ? Math.round(withSlug / totalApproved * 100) : 0,
      },
      topReferrers,
      recentClaims: {
        last7Days: recentClaimCount || 0,
      },
      conversionMetrics: {
        totalClaims: connectionsBySource['referral_link'] || 0,
        totalViews: 'not tracked yet',
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
