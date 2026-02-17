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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') === 'asc' ? true : false; // ascending = true

    const allowedSortFields = ['created_at', 'last_login_at', 'tier', 'account_status', 'subscription_status'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query
    let query = serviceSupabase
      .from('user_profiles')
      .select('*', { count: 'exact' })
      .order(sortField, { ascending: order })
      .range(from, to);

    // If searching by email, we need to join with auth.users.
    // Since we can't directly join auth.users from the client, we search user_id
    // via the service role auth admin API if search is provided.
    if (search) {
      // Search for users by email using Supabase Auth admin
      const { data: authData } = await serviceSupabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (authData?.users) {
        const matchingUserIds = authData.users
          .filter((u) => u.email?.toLowerCase().includes(search.toLowerCase()))
          .map((u) => u.id);

        if (matchingUserIds.length === 0) {
          return NextResponse.json({
            users: [],
            pagination: { page, limit, total: 0, total_pages: 0 },
          });
        }

        query = query.in('user_id', matchingUserIds);
      }
    }

    const { data: profiles, count, error } = await query;

    if (error) {
      console.error('Admin user list error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with email from auth
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

    const enrichedUsers = (profiles || []).map((profile) => ({
      ...profile,
      email: emailMap.get(profile.user_id) || null,
    }));

    const total = count ?? 0;

    return NextResponse.json({
      users: enrichedUsers,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
