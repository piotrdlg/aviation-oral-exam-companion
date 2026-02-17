import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';

/**
 * POST /api/admin/prompts/[id]/rollback
 *
 * Rollback a published prompt version:
 * 1. Archive the currently published version for the same key/rating/study_mode
 * 2. Find the most recent previously published (now archived) version
 * 3. Restore it to published status
 *
 * The [id] parameter identifies the currently published version to roll back from.
 * If [id] is not the currently published version, returns 400.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, serviceSupabase } = await requireAdmin(request);
    const { id: promptId } = await params;

    // Fetch the current prompt
    const { data: current, error: fetchError } = await serviceSupabase
      .from('prompt_versions')
      .select('*')
      .eq('id', promptId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Prompt version not found' }, { status: 404 });
    }

    if (current.status !== 'published') {
      return NextResponse.json(
        { error: 'Can only rollback a currently published version' },
        { status: 400 }
      );
    }

    // Find the previous version to restore.
    // Look for the most recently archived version with the same key/rating/study_mode
    // that was previously published (has a published_at timestamp).
    let previousQuery = serviceSupabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_key', current.prompt_key)
      .eq('status', 'archived')
      .not('published_at', 'is', null) // Was previously published
      .neq('id', promptId) // Not the current one
      .order('published_at', { ascending: false })
      .limit(1);

    if (current.rating) {
      previousQuery = previousQuery.eq('rating', current.rating);
    } else {
      previousQuery = previousQuery.is('rating', null);
    }

    if (current.study_mode) {
      previousQuery = previousQuery.eq('study_mode', current.study_mode);
    } else {
      previousQuery = previousQuery.is('study_mode', null);
    }

    const { data: previousVersions, error: prevError } = await previousQuery;

    if (prevError) {
      return NextResponse.json({ error: prevError.message }, { status: 500 });
    }

    if (!previousVersions || previousVersions.length === 0) {
      return NextResponse.json(
        { error: 'No previous published version found to roll back to' },
        { status: 404 }
      );
    }

    const previous = previousVersions[0];

    // Step 1: Archive the current published version
    const { error: archiveError } = await serviceSupabase
      .from('prompt_versions')
      .update({ status: 'archived' })
      .eq('id', promptId);

    if (archiveError) {
      return NextResponse.json({ error: 'Failed to archive current version' }, { status: 500 });
    }

    // Step 2: Restore the previous version to published
    const { data: restored, error: restoreError } = await serviceSupabase
      .from('prompt_versions')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: user.id,
      })
      .eq('id', previous.id)
      .select()
      .single();

    if (restoreError) {
      // Attempt to revert the archive in case of failure
      await serviceSupabase
        .from('prompt_versions')
        .update({ status: 'published' })
        .eq('id', promptId);

      return NextResponse.json({ error: 'Failed to restore previous version' }, { status: 500 });
    }

    await logAdminAction(
      user.id,
      'prompt.rollback',
      'prompt_version',
      promptId,
      {
        prompt_key: current.prompt_key,
        rolled_back_version: current.version,
        restored_version: previous.version,
        restored_id: previous.id,
      },
      null,
      request
    );

    return NextResponse.json({
      rolled_back: { id: promptId, version: current.version },
      restored: restored,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
