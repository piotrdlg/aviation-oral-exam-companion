import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/instructor-program
 *
 * Returns instructor program health metrics:
 * - Instructors by status
 * - Connections by state
 * - Invite claim rate
 * - Pending approvals count
 * - Suspicious patterns
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // 1. Instructor counts by status
    const { data: instructorRows } = await serviceSupabase
      .from('instructor_profiles')
      .select('status');

    const instructorsByStatus: Record<string, number> = {};
    for (const row of instructorRows || []) {
      const status = row.status as string;
      instructorsByStatus[status] = (instructorsByStatus[status] || 0) + 1;
    }

    // 2. Connection counts by state
    const { data: connectionRows } = await serviceSupabase
      .from('student_instructor_connections')
      .select('state');

    const connectionsByState: Record<string, number> = {};
    for (const row of connectionRows || []) {
      const state = row.state as string;
      connectionsByState[state] = (connectionsByState[state] || 0) + 1;
    }

    // 3. Invite claim rate (accepted_at not null = claimed)
    const { count: totalInvites } = await serviceSupabase
      .from('instructor_invites')
      .select('id', { count: 'exact', head: true });

    const { count: claimedInvites } = await serviceSupabase
      .from('instructor_invites')
      .select('id', { count: 'exact', head: true })
      .not('accepted_at', 'is', null);

    const inviteClaimRate = totalInvites && totalInvites > 0
      ? Math.round((claimedInvites || 0) / totalInvites * 100)
      : 0;

    // 4. Pending approvals count
    const pendingApprovals = instructorsByStatus['pending'] || 0;

    // 5. Suspicious patterns
    const suspicious: string[] = [];

    // Self-connections (instructor_user_id === student_user_id — should be impossible)
    const { data: allConns } = await serviceSupabase
      .from('student_instructor_connections')
      .select('instructor_user_id, student_user_id');

    let selfConnectionCount = 0;
    for (const c of allConns || []) {
      if (c.instructor_user_id === c.student_user_id) {
        selfConnectionCount++;
      }
    }
    if (selfConnectionCount > 0) {
      suspicious.push(`${selfConnectionCount} self-connection(s) detected`);
    }

    // High invite churn: instructors with >10 revoked invites
    const { data: revokedRows } = await serviceSupabase
      .from('instructor_invites')
      .select('instructor_user_id')
      .not('revoked_at', 'is', null);

    const revokedByInstructor = new Map<string, number>();
    for (const r of revokedRows || []) {
      const uid = r.instructor_user_id as string;
      revokedByInstructor.set(uid, (revokedByInstructor.get(uid) || 0) + 1);
    }
    for (const [uid, count] of revokedByInstructor) {
      if (count > 10) {
        suspicious.push(`Instructor ${uid.slice(0, 8)}... has ${count} revoked invites`);
      }
    }

    return NextResponse.json({
      instructorsByStatus,
      connectionsByState,
      inviteMetrics: {
        total: totalInvites || 0,
        claimed: claimedInvites || 0,
        claimRate: inviteClaimRate,
      },
      pendingApprovals,
      suspicious,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
