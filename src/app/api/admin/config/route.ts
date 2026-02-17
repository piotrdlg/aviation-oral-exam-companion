import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';

/**
 * GET /api/admin/config
 *
 * Returns all system_config entries.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const { data: config, error } = await serviceSupabase
      .from('system_config')
      .select('*')
      .order('key', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ configs: config || [] });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/config
 *
 * Update a specific config key's value.
 *
 * Body: { key: string, value: object, reason?: string }
 *
 * Note: updated_at is set explicitly (no DB trigger exists for this table).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, serviceSupabase } = await requireAdmin(request);

    const body = await request.json();

    // Support both single-key and batch updates
    const updates: Array<{ key: string; value: Record<string, unknown> }> = body.updates
      ? (body.updates as Array<{ key: string; value: Record<string, unknown> }>)
      : body.key
        ? [{ key: body.key as string, value: body.value as Record<string, unknown> }]
        : [];

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: key+value or updates array' },
        { status: 400 }
      );
    }

    const reason = (body.reason as string) || null;
    const now = new Date().toISOString();

    for (const { key, value } of updates) {
      if (!key || value === undefined || value === null) continue;

      // Fetch current value for audit logging
      const { data: currentConfig } = await serviceSupabase
        .from('system_config')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (currentConfig) {
        // Update existing
        await serviceSupabase
          .from('system_config')
          .update({ value, updated_at: now, updated_by: user.id })
          .eq('key', key);
      } else {
        // Insert new
        await serviceSupabase
          .from('system_config')
          .insert({ key, value, updated_at: now, updated_by: user.id });
      }

      await logAdminAction(
        user.id,
        'config.update',
        'system_config',
        key,
        { previous_value: currentConfig?.value ?? null, new_value: value },
        reason,
        request
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAdminError(error);
  }
}
