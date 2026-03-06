import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/quality/instructor-entitlements
 *
 * Returns daily aggregate metrics for instructor entitlement state.
 * No sensitive detail (no user IDs, emails, or PII) — just counts by status
 * and courtesy reason for dashboards and monitoring.
 *
 * Auth: admin-only via requireAdmin().
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const now = new Date();

    // 1. Count approved instructors
    const { data: approvedProfiles } = await serviceSupabase
      .from('instructor_profiles')
      .select('user_id')
      .eq('status', 'approved');

    const approvedInstructorIds = (approvedProfiles || []).map(
      (p: { user_id: string }) => p.user_id
    );
    const approvedInstructors = approvedInstructorIds.length;

    if (approvedInstructors === 0) {
      return NextResponse.json({
        timestamp: now.toISOString(),
        approvedInstructors: 0,
        withCourtesy: 0,
        withoutCourtesy: 0,
        directOverridesActive: 0,
        studentOverridesActive: 0,
        courtesyByReason: {
          paid_student: 0,
          student_override: 0,
          direct_override: 0,
        },
      });
    }

    // 2. Count active direct overrides (not expired)
    const { data: directOverrides } = await serviceSupabase
      .from('instructor_access_overrides')
      .select('instructor_user_id, expires_at')
      .eq('active', true)
      .in('instructor_user_id', approvedInstructorIds);

    const activeDirectOverrides = (directOverrides || []).filter(
      (o: { expires_at: string | null }) =>
        !o.expires_at || new Date(o.expires_at) > now
    );
    const directOverrideInstructorIds = new Set(
      activeDirectOverrides.map((o: { instructor_user_id: string }) => o.instructor_user_id)
    );
    const directOverridesActive = directOverrideInstructorIds.size;

    // 3. Find instructors with connected students who have paid-active subscriptions
    const { data: connections } = await serviceSupabase
      .from('student_instructor_connections')
      .select('instructor_user_id, student_user_id')
      .eq('state', 'connected')
      .in('instructor_user_id', approvedInstructorIds);

    const connectedStudentIds = new Set(
      (connections || []).map((c: { student_user_id: string }) => c.student_user_id)
    );

    // Get paid-active students
    let paidStudentInstructorIds = new Set<string>();
    if (connectedStudentIds.size > 0) {
      const { data: studentProfiles } = await serviceSupabase
        .from('user_profiles')
        .select('user_id, subscription_status')
        .in('user_id', [...connectedStudentIds]);

      const paidStudentUserIds = new Set(
        (studentProfiles || [])
          .filter(
            (p: { subscription_status: string | null }) =>
              p.subscription_status === 'active' || p.subscription_status === 'trialing'
          )
          .map((p: { user_id: string }) => p.user_id)
      );

      // Map paid students back to their instructors
      for (const conn of connections || []) {
        const c = conn as { instructor_user_id: string; student_user_id: string };
        if (paidStudentUserIds.has(c.student_user_id)) {
          paidStudentInstructorIds.add(c.instructor_user_id);
        }
      }
    }

    // 4. Find instructors with connected students who have paid_equivalent overrides
    let studentOverrideInstructorIds = new Set<string>();
    if (connectedStudentIds.size > 0) {
      const { data: studentOverrides } = await serviceSupabase
        .from('user_entitlement_overrides')
        .select('user_id, expires_at')
        .in('user_id', [...connectedStudentIds])
        .eq('entitlement_key', 'paid_equivalent')
        .eq('active', true);

      const overrideStudentIds = new Set(
        (studentOverrides || [])
          .filter(
            (o: { expires_at: string | null }) =>
              !o.expires_at || new Date(o.expires_at) > now
          )
          .map((o: { user_id: string }) => o.user_id)
      );

      for (const conn of connections || []) {
        const c = conn as { instructor_user_id: string; student_user_id: string };
        if (overrideStudentIds.has(c.student_user_id)) {
          studentOverrideInstructorIds.add(c.instructor_user_id);
        }
      }
    }

    // 5. Compute courtesy counts by reason (following the priority order in the resolver)
    //    Priority: direct_override > paid_student > student_override
    const courtesyByReason = {
      paid_student: 0,
      student_override: 0,
      direct_override: 0,
    };

    const withCourtesyIds = new Set<string>();

    // Direct overrides first (highest priority)
    for (const id of directOverrideInstructorIds) {
      withCourtesyIds.add(id);
      courtesyByReason.direct_override++;
    }

    // Paid students next
    for (const id of paidStudentInstructorIds) {
      if (!withCourtesyIds.has(id)) {
        withCourtesyIds.add(id);
        courtesyByReason.paid_student++;
      }
    }

    // Student overrides last
    for (const id of studentOverrideInstructorIds) {
      if (!withCourtesyIds.has(id)) {
        withCourtesyIds.add(id);
        courtesyByReason.student_override++;
      }
    }

    const withCourtesy = withCourtesyIds.size;
    const withoutCourtesy = approvedInstructors - withCourtesy;

    return NextResponse.json({
      timestamp: now.toISOString(),
      approvedInstructors,
      withCourtesy,
      withoutCourtesy,
      directOverridesActive: directOverridesActive,
      studentOverridesActive: studentOverrideInstructorIds.size,
      courtesyByReason,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
