import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';

/**
 * POST /api/admin/moderation/[id]
 *
 * Resolve or dismiss a moderation queue item.
 *
 * Body:
 * - status: 'resolved' | 'dismissed' (required)
 * - admin_notes: string (optional)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, serviceSupabase } = await requireAdmin(request);
    const { id } = await params;

    const body = await request.json();
    // Accept both formats:
    //   { status: 'resolved' | 'dismissed', admin_notes }
    //   { action: 'resolve' | 'dismiss', resolution_notes }
    const actionMap: Record<string, string> = { resolve: 'resolved', dismiss: 'dismissed' };
    const rawStatus = body.status || actionMap[body.action] || '';
    const adminNotes = body.admin_notes || body.resolution_notes || undefined;

    if (!rawStatus || !['resolved', 'dismissed'].includes(rawStatus)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "resolved" or "dismissed".' },
        { status: 400 }
      );
    }
    const status = rawStatus;

    // Verify the item exists
    const { data: existing, error: fetchError } = await serviceSupabase
      .from('moderation_queue')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('Moderation fetch error:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Moderation item not found' }, { status: 404 });
    }

    // Update the item
    const { error: updateError } = await serviceSupabase
      .from('moderation_queue')
      .update({
        status,
        resolution_notes: adminNotes || null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Moderation update error:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Audit log
    await logAdminAction(
      user.id,
      `moderation.${status}`,
      'moderation_queue',
      id,
      { previous_status: existing.status, new_status: status, admin_notes: adminNotes },
      adminNotes || null,
      request
    );

    return NextResponse.json({ ok: true, id, status });
  } catch (error) {
    return handleAdminError(error);
  }
}
