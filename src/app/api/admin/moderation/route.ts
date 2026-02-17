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

    if (status !== 'all' && !VALID_STATUSES.includes(status as ModerationStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: all, ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = serviceSupabase
      .from('moderation_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // 'all' means no status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Moderation list error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with emails for reporter and resolver
    const rows = data || [];
    const userIds = new Set<string>();
    for (const item of rows) {
      if (item.reporter_user_id) userIds.add(item.reporter_user_id as string);
      if (item.resolved_by) userIds.add(item.resolved_by as string);
    }

    let emailMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: authUsers } = await serviceSupabase.auth.admin.listUsers({ perPage: 100 });
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (userIds.has(u.id)) {
            emailMap[u.id] = u.email || 'unknown';
          }
        }
      }
    }

    const items = rows.map((item) => ({
      id: item.id,
      report_type: item.report_type,
      reporter_email: item.reporter_user_id ? (emailMap[item.reporter_user_id as string] || null) : null,
      session_id: item.session_id || null,
      transcript_id: item.transcript_id || null,
      details: item.details || {},
      status: item.status,
      resolution_notes: item.resolution_notes || null,
      resolved_by_email: item.resolved_by ? (emailMap[item.resolved_by as string] || null) : null,
      resolved_at: item.resolved_at || null,
      created_at: item.created_at,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    return handleAdminError(error);
  }
}
