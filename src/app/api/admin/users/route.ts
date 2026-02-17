import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/users
 *
 * Paginated user list with search and sort.
 *
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 25, max 100)
 * - search: string (email partial match)
 * - sort: 'created_at' | 'last_login_at' | 'tier' (default 'created_at')
 * - order: 'asc' | 'desc' (default 'desc')
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '25', 10)));
    const search = searchParams.get('search') || '';
    const tierFilter = searchParams.get('tier') || '';
    const statusFilter = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') === 'asc' ? true : false;

    const allowedSortFields = ['created_at', 'last_login_at', 'tier', 'account_status', 'subscription_status'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Fetch auth users once for email lookup and search
    const { data: authUsers } = await serviceSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const emailMap = new Map<string, string>();
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        emailMap.set(u.id, u.email || '');
      }
    }

    // Build query
    let query = serviceSupabase
      .from('user_profiles')
      .select('user_id, tier, account_status, subscription_status, last_login_at, created_at', { count: 'exact' })
      .order(sortField, { ascending: order })
      .range(from, to);

    // Apply tier filter
    if (tierFilter) {
      query = query.eq('tier', tierFilter);
    }

    // Apply account status filter
    if (statusFilter) {
      query = query.eq('account_status', statusFilter);
    }

    // Email search — filter by matching user IDs
    if (search) {
      const matchingUserIds = [...emailMap.entries()]
        .filter(([, email]) => email.toLowerCase().includes(search.toLowerCase()))
        .map(([id]) => id);

      if (matchingUserIds.length === 0) {
        return NextResponse.json({ users: [], total: 0, page, pageSize });
      }

      query = query.in('user_id', matchingUserIds);
    }

    const { data: profiles, count, error } = await query;

    if (error) {
      console.error('Admin user list error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch session counts for these users
    const userIds = (profiles || []).map((p) => p.user_id as string);
    let sessionCounts: Record<string, { count: number; exchanges: number }> = {};
    if (userIds.length > 0) {
      const { data: sessions } = await serviceSupabase
        .from('exam_sessions')
        .select('user_id, exchange_count')
        .in('user_id', userIds);

      if (sessions) {
        for (const s of sessions) {
          const uid = s.user_id as string;
          if (!sessionCounts[uid]) {
            sessionCounts[uid] = { count: 0, exchanges: 0 };
          }
          sessionCounts[uid].count += 1;
          sessionCounts[uid].exchanges += (s.exchange_count as number) || 0;
        }
      }
    }

    const users = (profiles || []).map((profile) => ({
      id: profile.user_id as string,
      email: emailMap.get(profile.user_id as string) || 'unknown',
      tier: profile.tier as string,
      account_status: profile.account_status as string,
      subscription_status: profile.subscription_status as string,
      last_login_at: profile.last_login_at as string | null,
      created_at: profile.created_at as string,
      session_count: sessionCounts[profile.user_id as string]?.count ?? 0,
      total_exchanges: sessionCounts[profile.user_id as string]?.exchanges ?? 0,
    }));

    return NextResponse.json({
      users,
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
