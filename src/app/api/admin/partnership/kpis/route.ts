import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/partnership/kpis
 * Returns global instructor program summary + per-instructor KPI table data.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // 1. Global summary
    const { data: allInstructors } = await serviceSupabase
      .from('instructor_profiles')
      .select('user_id, status, first_name, last_name');

    const approved = (allInstructors || []).filter((i: { status: string }) => i.status === 'approved');
    const approvedIds = approved.map((i: { user_id: string }) => i.user_id);

    // 2. Get connections for all approved instructors
    const { data: allConnections } = await serviceSupabase
      .from('student_instructor_connections')
      .select('instructor_user_id, student_user_id, state, connection_source');

    const connsByInstructor = new Map<string, { connected: number; pending: number; sources: Record<string, number> }>();
    for (const conn of allConnections || []) {
      const iid = conn.instructor_user_id as string;
      if (!connsByInstructor.has(iid)) {
        connsByInstructor.set(iid, { connected: 0, pending: 0, sources: {} });
      }
      const entry = connsByInstructor.get(iid)!;
      if (conn.state === 'connected') entry.connected++;
      if (conn.state === 'pending' || conn.state === 'invited') entry.pending++;
      const src = (conn.connection_source as string) || 'unknown';
      entry.sources[src] = (entry.sources[src] || 0) + 1;
    }

    // 3. Get connected student subscription statuses
    const connectedStudentIds = (allConnections || [])
      .filter((c: { state: string }) => c.state === 'connected')
      .map((c: { student_user_id: string }) => c.student_user_id);

    const paidStudentsByInstructor = new Map<string, number>();

    if (connectedStudentIds.length > 0) {
      const { data: studentProfiles } = await serviceSupabase
        .from('user_profiles')
        .select('user_id, subscription_status')
        .in('user_id', connectedStudentIds);

      const paidStudentSet = new Set(
        (studentProfiles || [])
          .filter((p: { subscription_status: string | null }) => p.subscription_status === 'active')
          .map((p: { user_id: string }) => p.user_id)
      );

      // Map paid students back to their instructors
      for (const conn of allConnections || []) {
        if (conn.state === 'connected' && paidStudentSet.has(conn.student_user_id as string)) {
          const iid = conn.instructor_user_id as string;
          paidStudentsByInstructor.set(iid, (paidStudentsByInstructor.get(iid) || 0) + 1);
        }
      }
    }

    // 4. Invite events summary
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inviteEvents } = await serviceSupabase
      .from('instructor_invite_events')
      .select('instructor_user_id, event_type')
      .gte('created_at', sevenDaysAgo);

    const invitesByInstructor = new Map<string, { emails: number; tokens: number; claims: number }>();
    for (const evt of inviteEvents || []) {
      const iid = evt.instructor_user_id as string;
      if (!invitesByInstructor.has(iid)) {
        invitesByInstructor.set(iid, { emails: 0, tokens: 0, claims: 0 });
      }
      const entry = invitesByInstructor.get(iid)!;
      if (evt.event_type === 'email_sent') entry.emails++;
      if (evt.event_type === 'token_created') entry.tokens++;
      if (evt.event_type === 'claimed') entry.claims++;
    }

    // 5. Build per-instructor table
    const instructorRows = approved.map((inst: { user_id: string; first_name: string | null; last_name: string | null }) => {
      const conns = connsByInstructor.get(inst.user_id) || { connected: 0, pending: 0, sources: {} };
      const invites = invitesByInstructor.get(inst.user_id) || { emails: 0, tokens: 0, claims: 0 };
      const paid = paidStudentsByInstructor.get(inst.user_id) || 0;

      return {
        instructorId: inst.user_id.slice(0, 8),
        displayName: [inst.first_name, inst.last_name].filter(Boolean).join(' ') || 'Unknown',
        connectedStudents: conns.connected,
        pendingRequests: conns.pending,
        paidStudents: paid,
        invites7d: invites.emails + invites.tokens,
        claims7d: invites.claims,
      };
    });

    // 6. Global summary
    const withConnected = approvedIds.filter((id: string) => {
      const c = connsByInstructor.get(id);
      return c && c.connected > 0;
    }).length;

    const withPaid = approvedIds.filter((id: string) => {
      return (paidStudentsByInstructor.get(id) || 0) > 0;
    }).length;

    // 7. Funnel
    const totalInvites7d = (inviteEvents || []).filter(
      (e: { event_type: string }) => e.event_type === 'email_sent' || e.event_type === 'token_created'
    ).length;
    const totalClaims7d = (inviteEvents || []).filter(
      (e: { event_type: string }) => e.event_type === 'claimed'
    ).length;
    const totalConnected = [...connsByInstructor.values()].reduce((sum, c) => sum + c.connected, 0);

    return NextResponse.json({
      summary: {
        totalApproved: approved.length,
        withConnectedStudents: withConnected,
        withPaidStudents: withPaid,
      },
      funnel: {
        invites7d: totalInvites7d,
        claims7d: totalClaims7d,
        totalConnections: totalConnected,
        totalPaidStudents: [...paidStudentsByInstructor.values()].reduce((s, c) => s + c, 0),
      },
      instructors: instructorRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
