import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/instructor-entitlements
 *
 * Returns aggregate entitlement metrics for the admin dashboard:
 * - Approved instructor count
 * - Instructors with/without courtesy access
 * - Active direct overrides and student overrides
 * - Overrides expiring within the next 14 days
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // 1. Count approved instructors
    const { count: instructorsApproved } = await serviceSupabase
      .from('instructor_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    // 2. Active direct instructor overrides
    const { data: directOverrides } = await serviceSupabase
      .from('instructor_access_overrides')
      .select('id, instructor_user_id, expires_at, reason')
      .eq('active', true);

    const activeDirectOverrides = (directOverrides || []).filter(
      (o: { expires_at: string | null }) =>
        !o.expires_at || new Date(o.expires_at) > now
    );

    // 3. Active student (user_entitlement) overrides
    const { data: studentOverrides } = await serviceSupabase
      .from('user_entitlement_overrides')
      .select('id, user_id, expires_at, reason')
      .eq('active', true);

    const activeStudentOverrides = (studentOverrides || []).filter(
      (o: { expires_at: string | null }) =>
        !o.expires_at || new Date(o.expires_at) > now
    );

    // 4. Determine which approved instructors have courtesy access
    //    Courtesy sources: direct override OR connected paid-active student OR connected student with paid_equivalent override

    // 4a. Instructors with active direct overrides (already computed)
    const instructorsWithDirectOverride = new Set(
      activeDirectOverrides.map((o: { instructor_user_id: string }) => o.instructor_user_id)
    );

    // 4b. Get all connected student-instructor pairs (state = 'connected')
    const { data: connections } = await serviceSupabase
      .from('student_instructor_connections')
      .select('instructor_user_id, student_user_id')
      .eq('state', 'connected');

    // 4c. Get paid-active students among connected ones
    const connectedStudentIds = [
      ...new Set((connections || []).map((c: { student_user_id: string }) => c.student_user_id)),
    ];

    const paidStudentUserIds = new Set<string>();
    if (connectedStudentIds.length > 0) {
      const { data: studentProfiles } = await serviceSupabase
        .from('user_profiles')
        .select('user_id, subscription_status')
        .in('user_id', connectedStudentIds);

      for (const p of studentProfiles || []) {
        if (p.subscription_status === 'active' || p.subscription_status === 'trialing') {
          paidStudentUserIds.add(p.user_id as string);
        }
      }
    }

    // 4d. Students with active paid_equivalent override
    const overriddenStudentIds = new Set(
      activeStudentOverrides.map((o: { user_id: string }) => o.user_id)
    );

    // 4e. Build set of instructors who have courtesy via connected students
    const instructorsWithStudentCourtesy = new Set<string>();
    for (const conn of connections || []) {
      const studentId = conn.student_user_id as string;
      if (paidStudentUserIds.has(studentId) || overriddenStudentIds.has(studentId)) {
        instructorsWithStudentCourtesy.add(conn.instructor_user_id as string);
      }
    }

    // 4f. Union: instructors with courtesy = direct override OR student courtesy
    const instructorsWithCourtesy = new Set([
      ...instructorsWithDirectOverride,
      ...instructorsWithStudentCourtesy,
    ]);

    const instructorsWithCourtesyCount = instructorsWithCourtesy.size;
    const instructorsWithoutCourtesyCount = (instructorsApproved || 0) - instructorsWithCourtesyCount;

    // 5. Expiring overrides (next 14 days) from both tables
    const expiringOverrides: Array<{ userId: string; expiresAt: string; reason: string }> = [];

    for (const o of activeDirectOverrides) {
      if (o.expires_at) {
        const expiresDate = new Date(o.expires_at);
        if (expiresDate > now && expiresDate <= fourteenDaysFromNow) {
          expiringOverrides.push({
            userId: o.instructor_user_id as string,
            expiresAt: o.expires_at as string,
            reason: (o.reason as string) || 'No reason provided',
          });
        }
      }
    }

    for (const o of activeStudentOverrides) {
      if (o.expires_at) {
        const expiresDate = new Date(o.expires_at);
        if (expiresDate > now && expiresDate <= fourteenDaysFromNow) {
          expiringOverrides.push({
            userId: o.user_id as string,
            expiresAt: o.expires_at as string,
            reason: (o.reason as string) || 'No reason provided',
          });
        }
      }
    }

    // Sort expiring overrides by expiration date (soonest first)
    expiringOverrides.sort(
      (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    );

    return NextResponse.json({
      instructorsApproved: instructorsApproved || 0,
      instructorsWithCourtesy: instructorsWithCourtesyCount,
      instructorsWithoutCourtesy: Math.max(0, instructorsWithoutCourtesyCount),
      overridesActive: activeDirectOverrides.length,
      expiringOverrides,
      studentOverridesActive: activeStudentOverrides.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
