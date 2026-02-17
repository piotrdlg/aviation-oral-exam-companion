import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/prompts
 *
 * List all prompt versions grouped by prompt_key.
 * Returns: { prompts: Record<string, PromptVersion[]> }
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const promptKey = searchParams.get('prompt_key');

    let query = serviceSupabase
      .from('prompt_versions')
      .select('*')
      .order('version', { ascending: false });

    if (promptKey) {
      query = query.eq('prompt_key', promptKey);
    } else {
      query = query.order('prompt_key', { ascending: true });
    }

    const { data: prompts, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ versions: prompts || [] });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/prompts
 *
 * Create a new draft prompt version. Auto-increments version number
 * within the same (prompt_key, rating, study_mode) group.
 *
 * Body: { prompt_key, content, rating?, study_mode?, change_summary? }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, serviceSupabase } = await requireAdmin(request);

    const body = await request.json();
    const { prompt_key, content, rating, study_mode, change_summary } = body as {
      prompt_key: string;
      content: string;
      rating?: string | null;
      study_mode?: string | null;
      change_summary?: string | null;
    };

    if (!prompt_key || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt_key, content' },
        { status: 400 }
      );
    }

    // Find the highest version number for this key/rating/study_mode combo
    let versionQuery = serviceSupabase
      .from('prompt_versions')
      .select('version')
      .eq('prompt_key', prompt_key)
      .order('version', { ascending: false })
      .limit(1);

    if (rating) {
      versionQuery = versionQuery.eq('rating', rating);
    } else {
      versionQuery = versionQuery.is('rating', null);
    }

    if (study_mode) {
      versionQuery = versionQuery.eq('study_mode', study_mode);
    } else {
      versionQuery = versionQuery.is('study_mode', null);
    }

    const { data: latestVersion } = await versionQuery;

    const nextVersion = latestVersion && latestVersion.length > 0
      ? (latestVersion[0].version as number) + 1
      : 1;

    const { data: newPrompt, error } = await serviceSupabase
      .from('prompt_versions')
      .insert({
        prompt_key,
        rating: rating || null,
        study_mode: study_mode || null,
        version: nextVersion,
        content,
        status: 'draft',
        change_summary: change_summary || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction(
      user.id,
      'prompt.create_draft',
      'prompt_version',
      newPrompt.id,
      { prompt_key, version: nextVersion, rating, study_mode },
      null,
      request
    );

    return NextResponse.json({ prompt: newPrompt }, { status: 201 });
  } catch (error) {
    return handleAdminError(error);
  }
}
