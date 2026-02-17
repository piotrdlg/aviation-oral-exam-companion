import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin-guard';
import type { ModerationStatus } from '@/types/database';

const VALID_STATUSES: ModerationStatus[] = ['open', 'reviewing', 'resolved', 'dismissed'];

/**
 * GET /api/admin/moderation
 *
 * List moderation queue items with optional status filter.
 *
 * Query params:
 * - status: ModerationStatus (default: 'open')
 * - page: number (default 1)
 * - limit: number (default 25, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'open';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));

    if (!VALID_STATUSES.includes(status as ModerationStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await serviceSupabase
      .from('moderation_queue')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Moderation list error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = count ?? 0;

    return NextResponse.json({
      items: data || [],
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
