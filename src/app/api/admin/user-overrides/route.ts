import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError, logAdminAction } from '@/lib/admin-guard';

/**
 * GET /api/admin/user-overrides
 *
 * Lists all active user_entitlement_overrides.
 */
export async function GET(request: NextRequest) {
  try {
    const { serviceSupabase } = await requireAdmin(request);

    const { data: overrides, error } = await serviceSupabase
      .from('user_entitlement_overrides')
      .select('id, user_id, entitlement_key, active, expires_at, reason, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch user entitlement overrides:', error);
      return NextResponse.json({ error: 'Failed to fetch overrides' }, { status: 500 });
    }

    return NextResponse.json({
      overrides: (overrides || []).map((o) => ({
        id: o.id,
        userId: o.user_id,
        entitlementKey: o.entitlement_key,
        active: o.active,
        expiresAt: o.expires_at,
        reason: o.reason,
        createdAt: o.created_at,
      })),
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/user-overrides
 *
 * Grant or revoke a user entitlement override.
 *
 * Body:
 *   action: "grant" | "revoke"
 *   userId: string
 *   entitlementKey: "paid_equivalent"
 *   reason: string
 *   expiresAt: string | null   (ISO 8601, only for grant)
 */
export async function POST(request: NextRequest) {
  try {
    const { user, serviceSupabase } = await requireAdmin(request);

    const body = await request.json();
    const { action, userId, entitlementKey, reason, expiresAt } = body as {
      action: string;
      userId: string;
      entitlementKey: string;
      reason: string;
      expiresAt: string | null;
    };

    // Validate required fields
    if (!action || !userId || !entitlementKey) {
      return NextResponse.json(
        { error: 'Missing required fields: action, userId, entitlementKey' },
        { status: 400 }
      );
    }

    if (action !== 'grant' && action !== 'revoke') {
      return NextResponse.json(
        { error: 'action must be "grant" or "revoke"' },
        { status: 400 }
      );
    }

    if (entitlementKey !== 'paid_equivalent') {
      return NextResponse.json(
        { error: 'entitlementKey must be "paid_equivalent"' },
        { status: 400 }
      );
    }

    if (action === 'grant') {
      if (!reason) {
        return NextResponse.json(
          { error: 'reason is required for grant action' },
          { status: 400 }
        );
      }

      // UPSERT: on conflict (user_id, entitlement_key), update to active
      const { data: upserted, error } = await serviceSupabase
        .from('user_entitlement_overrides')
        .upsert(
          {
            user_id: userId,
            entitlement_key: entitlementKey,
            active: true,
            expires_at: expiresAt || null,
            reason,
            created_by: user.id,
          },
          { onConflict: 'user_id,entitlement_key' }
        )
        .select('id, user_id, entitlement_key, active, expires_at, reason, created_at')
        .single();

      if (error) {
        console.error('Failed to grant user entitlement override:', error);
        return NextResponse.json({ error: 'Failed to grant override' }, { status: 500 });
      }

      await logAdminAction(
        user.id,
        'user_override_grant',
        'user_entitlement_override',
        upserted.id,
        { userId, entitlementKey, expiresAt, reason },
        reason,
        request
      );

      return NextResponse.json({
        ok: true,
        override: {
          id: upserted.id,
          userId: upserted.user_id,
          entitlementKey: upserted.entitlement_key,
          active: upserted.active,
          expiresAt: upserted.expires_at,
          reason: upserted.reason,
          createdAt: upserted.created_at,
        },
      });
    }

    // action === 'revoke'
    const { data: revoked, error } = await serviceSupabase
      .from('user_entitlement_overrides')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('entitlement_key', entitlementKey)
      .select('id, user_id, entitlement_key, active, expires_at, reason, created_at')
      .single();

    if (error) {
      console.error('Failed to revoke user entitlement override:', error);
      return NextResponse.json({ error: 'Failed to revoke override' }, { status: 500 });
    }

    await logAdminAction(
      user.id,
      'user_override_revoke',
      'user_entitlement_override',
      revoked.id,
      { userId, entitlementKey, reason: reason || null },
      reason || null,
      request
    );

    return NextResponse.json({
      ok: true,
      override: {
        id: revoked.id,
        userId: revoked.user_id,
        entitlementKey: revoked.entitlement_key,
        active: revoked.active,
        expiresAt: revoked.expires_at,
        reason: revoked.reason,
        createdAt: revoked.created_at,
      },
    });
  } catch (error) {
    return handleAdminError(error);
  }
}
