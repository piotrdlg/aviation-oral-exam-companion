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

    return NextResponse.json({ config: config || [] });
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
    const { key, value, reason } = body as {
      key: string;
      value: Record<string, unknown>;
      reason?: string;
    };

    if (!key || value === undefined || value === null) {
      return NextResponse.json(
        { error: 'Missing required fields: key, value' },
        { status: 400 }
      );
    }

    // Fetch current value for audit logging
    const { data: currentConfig } = await serviceSupabase
      .from('system_config')
      .select('value')
      .eq('key', key)
      .single();

    if (!currentConfig) {
      return NextResponse.json({ error: `Config key not found: ${key}` }, { status: 404 });
    }

    // Update the config entry — set updated_at explicitly (no DB trigger)
    const { data: updated, error } = await serviceSupabase
      .from('system_config')
      .update({
        value,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('key', key)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction(
      user.id,
      'config.update',
      'system_config',
      key,
      { previous_value: currentConfig.value, new_value: value },
      reason || null,
      request
    );

    return NextResponse.json({ config: updated });
  } catch (error) {
    return handleAdminError(error);
  }
}
