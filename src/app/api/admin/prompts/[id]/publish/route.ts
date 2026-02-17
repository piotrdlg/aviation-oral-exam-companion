import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';

/**
 * POST /api/admin/prompts/[id]/publish
 *
 * Publish a prompt version:
 * 1. Archive the currently published version for the same prompt_key/rating/study_mode
 * 2. Set this version to status='published', published_at=now, published_by=admin
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, serviceSupabase } = await requireAdmin(request);
    const { id: promptId } = await params;

    // Fetch the prompt to publish
    const { data: prompt, error: fetchError } = await serviceSupabase
      .from('prompt_versions')
      .select('*')
      .eq('id', promptId)
      .single();

    if (fetchError || !prompt) {
      return NextResponse.json({ error: 'Prompt version not found' }, { status: 404 });
    }

    if (prompt.status === 'published') {
      return NextResponse.json({ error: 'This version is already published' }, { status: 400 });
    }

    // Archive currently published version(s) for the same key/rating/study_mode
    let archiveQuery = serviceSupabase
      .from('prompt_versions')
      .update({ status: 'archived' })
      .eq('prompt_key', prompt.prompt_key)
      .eq('status', 'published');

    if (prompt.rating) {
      archiveQuery = archiveQuery.eq('rating', prompt.rating);
    } else {
      archiveQuery = archiveQuery.is('rating', null);
    }

    if (prompt.study_mode) {
      archiveQuery = archiveQuery.eq('study_mode', prompt.study_mode);
    } else {
      archiveQuery = archiveQuery.is('study_mode', null);
    }

    const { error: archiveError } = await archiveQuery;

    if (archiveError) {
      console.error('Error archiving current published version:', archiveError.message);
      return NextResponse.json({ error: 'Failed to archive current version' }, { status: 500 });
    }

    // Publish the new version
    const { data: published, error: publishError } = await serviceSupabase
      .from('prompt_versions')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: user.id,
      })
      .eq('id', promptId)
      .select()
      .single();

    if (publishError) {
      return NextResponse.json({ error: publishError.message }, { status: 500 });
    }

    await logAdminAction(
      user.id,
      'prompt.publish',
      'prompt_version',
      promptId,
      {
        prompt_key: prompt.prompt_key,
        version: prompt.version,
        rating: prompt.rating,
        study_mode: prompt.study_mode,
      },
      null,
      request
    );

    return NextResponse.json({ prompt: published });
  } catch (error) {
    return handleAdminError(error);
  }
}
