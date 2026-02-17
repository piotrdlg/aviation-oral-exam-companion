import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';
import type { AccountStatus, VoiceTier } from '@/types/database';

type AdminAction =
  | 'ban'
  | 'suspend'
  | 'activate'
  | 'change_tier'
  | 'delete'
  | 'add_note'
  | 'extend_trial';

interface ActionPayload {
  action: AdminAction;
  reason?: string;
  tier?: VoiceTier;
  note?: string;
  trial_days?: number;
}

/**
 * POST /api/admin/users/[id]/actions
 *
 * Perform an admin action on a user.
 *
 * Body: { action, reason?, tier?, note?, trial_days? }
 *
 * Actions:
 * - ban: Set account_status='banned'
 * - suspend: Set account_status='suspended'
 * - activate: Set account_status='active'
 * - change_tier: Update tier to specified value
 * - delete: Cascade delete user (auth + profile)
 * - add_note: Add an admin note for the user
 * - extend_trial: Extend trial_end by N days
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser, serviceSupabase } = await requireAdmin(request);
    const { id: targetUserId } = await params;

    const body = (await request.json()) as ActionPayload;
    const { action, reason, tier, note, trial_days } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    // Verify target user exists
    const { data: targetProfile, error: profileError } = await serviceSupabase
      .from('user_profiles')
      .select('user_id, account_status, tier, trial_end')
      .eq('user_id', targetUserId)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let updatedProfile = null;

    switch (action) {
      case 'ban':
      case 'suspend':
      case 'activate': {
        const statusMap: Record<string, AccountStatus> = {
          ban: 'banned',
          suspend: 'suspended',
          activate: 'active',
        };
        const newStatus = statusMap[action];

        const { data, error } = await serviceSupabase
          .from('user_profiles')
          .update({
            account_status: newStatus,
            status_reason: reason || null,
            status_changed_at: new Date().toISOString(),
            status_changed_by: adminUser.id,
          })
          .eq('user_id', targetUserId)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        updatedProfile = data;

        await logAdminAction(
          adminUser.id,
          `user.${action}`,
          'user',
          targetUserId,
          { previous_status: targetProfile.account_status, new_status: newStatus },
          reason || null,
          request
        );
        break;
      }

      case 'change_tier': {
        if (!tier) {
          return NextResponse.json({ error: 'Missing tier for change_tier action' }, { status: 400 });
        }
        const validTiers: VoiceTier[] = ['ground_school', 'checkride_prep', 'dpe_live'];
        if (!validTiers.includes(tier)) {
          return NextResponse.json({ error: `Invalid tier: ${tier}` }, { status: 400 });
        }

        const { data, error } = await serviceSupabase
          .from('user_profiles')
          .update({ tier })
          .eq('user_id', targetUserId)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        updatedProfile = data;

        await logAdminAction(
          adminUser.id,
          'user.change_tier',
          'user',
          targetUserId,
          { previous_tier: targetProfile.tier, new_tier: tier },
          reason || null,
          request
        );
        break;
      }

      case 'extend_trial': {
        const days = trial_days || 7;
        if (days < 1 || days > 365) {
          return NextResponse.json({ error: 'trial_days must be between 1 and 365' }, { status: 400 });
        }

        const currentTrialEnd = targetProfile.trial_end
          ? new Date(targetProfile.trial_end)
          : new Date();
        const newTrialEnd = new Date(currentTrialEnd.getTime() + days * 24 * 60 * 60 * 1000);

        const { data, error } = await serviceSupabase
          .from('user_profiles')
          .update({ trial_end: newTrialEnd.toISOString() })
          .eq('user_id', targetUserId)
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        updatedProfile = data;

        await logAdminAction(
          adminUser.id,
          'user.extend_trial',
          'user',
          targetUserId,
          { previous_trial_end: targetProfile.trial_end, new_trial_end: newTrialEnd.toISOString(), days },
          reason || null,
          request
        );
        break;
      }

      case 'add_note': {
        if (!note || note.trim().length === 0) {
          return NextResponse.json({ error: 'Missing note text' }, { status: 400 });
        }

        const { data: noteData, error: noteError } = await serviceSupabase
          .from('admin_notes')
          .insert({
            target_user_id: targetUserId,
            admin_user_id: adminUser.id,
            note: note.trim(),
          })
          .select()
          .single();

        if (noteError) {
          return NextResponse.json({ error: noteError.message }, { status: 500 });
        }

        await logAdminAction(
          adminUser.id,
          'user.add_note',
          'user',
          targetUserId,
          { note_id: noteData.id },
          null,
          request
        );

        return NextResponse.json({ ok: true, note: noteData });
      }

      case 'delete': {
        // Cascade delete: remove auth user (which cascades to profile, sessions, etc.)
        const { error: deleteError } = await serviceSupabase.auth.admin.deleteUser(targetUserId);

        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        await logAdminAction(
          adminUser.id,
          'user.delete',
          'user',
          targetUserId,
          { email: 'redacted' },
          reason || null,
          request
        );

        return NextResponse.json({ ok: true, deleted: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true, profile: updatedProfile });
  } catch (error) {
    return handleAdminError(error);
  }
}
