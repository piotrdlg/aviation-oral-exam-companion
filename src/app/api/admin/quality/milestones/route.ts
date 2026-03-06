import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    // 1. Total milestone declarations
    const { count: totalDeclarations } = await serviceSupabase
      .from('student_milestones')
      .select('id', { count: 'exact', head: true });

    // 2. Declarations by milestone_key
    const { data: milestoneRows } = await serviceSupabase
      .from('student_milestones')
      .select('milestone_key');

    const byKey: Record<string, number> = {};
    for (const row of milestoneRows || []) {
      const key = row.milestone_key as string;
      byKey[key] = (byKey[key] || 0) + 1;
    }

    // 3. Declarations by role (student vs instructor vs admin)
    const { data: roleRows } = await serviceSupabase
      .from('student_milestones')
      .select('declared_by_role');

    const byRole: Record<string, number> = {};
    for (const row of roleRows || []) {
      const role = row.declared_by_role as string;
      byRole[role] = (byRole[role] || 0) + 1;
    }

    // 4. Unique students with at least one milestone
    const { data: studentRows } = await serviceSupabase
      .from('student_milestones')
      .select('student_user_id');

    const uniqueStudents = new Set(
      (studentRows || []).map(r => r.student_user_id as string)
    ).size;

    // 5. Last 7 days activity
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentDeclarations } = await serviceSupabase
      .from('student_milestones')
      .select('id', { count: 'exact', head: true })
      .gte('declared_at', sevenDaysAgo);

    return NextResponse.json({
      totalDeclarations: totalDeclarations || 0,
      byKey,
      byRole,
      uniqueStudents,
      recentDeclarations: recentDeclarations || 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
