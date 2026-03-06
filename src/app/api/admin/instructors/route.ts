import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import type { InstructorStatus } from '@/lib/instructor-access';

/**
 * GET /api/admin/instructors
 *
 * Paginated list of instructor applications with optional status filter.
 *
 * Query params:
 * - status: InstructorStatus | 'all' (default 'pending')
 * - page: number (default 1)
 * - limit: number (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const statusFilter = (searchParams.get('status') || 'pending') as InstructorStatus | 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const validStatuses: InstructorStatus[] = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
    if (statusFilter !== 'all' && !validStatuses.includes(statusFilter)) {
      return NextResponse.json(
        { error: `Invalid status filter: ${statusFilter}. Use one of: ${validStatuses.join(', ')}, all` },
        { status: 400 }
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query
    let query = serviceSupabase
      .from('instructor_profiles')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    // Apply status filter (default: pending)
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: profiles, count, error } = await query;

    if (error) {
      console.error('Admin instructor list error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch user emails for the returned profiles
    const userIds = (profiles || []).map((p) => p.user_id as string);
    const emailMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: authUsers } = await serviceSupabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (userIds.includes(u.id)) {
            emailMap.set(u.id, u.email || '');
          }
        }
      }
    }

    // Attach email to each profile
    const applications = (profiles || []).map((profile) => ({
      ...profile,
      user_email: emailMap.get(profile.user_id as string) || 'unknown',
    }));

    return NextResponse.json({
      applications,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
