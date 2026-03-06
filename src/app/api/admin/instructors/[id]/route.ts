import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, handleAdminError } from '@/lib/admin-guard';
import {
  approveInstructor,
  rejectInstructor,
  suspendInstructor,
  reinstateInstructor,
} from '@/lib/instructor-access';

type InstructorAction = 'approve' | 'reject' | 'suspend' | 'reinstate';

interface ActionPayload {
  action: InstructorAction;
  reason?: string;
}

/**
 * GET /api/admin/instructors/[id]
 *
 * Get a single instructor profile by ID, including the user's email.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { serviceSupabase } = await requireAdmin(request);
    const { id: profileId } = await params;

    const { data: profile, error } = await serviceSupabase
      .from('instructor_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Fetch user email from auth
    let userEmail = 'unknown';
    const { data: authUser } = await serviceSupabase.auth.admin.getUserById(
      profile.user_id as string
    );
    if (authUser?.user?.email) {
      userEmail = authUser.user.email;
    }

    return NextResponse.json({
      profile,
      userEmail,
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

/**
 * POST /api/admin/instructors/[id]
 *
 * Perform an admin action on an instructor profile.
 *
 * Body: { action: 'approve' | 'reject' | 'suspend' | 'reinstate', reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser, serviceSupabase } = await requireAdmin(request);
    const { id: profileId } = await params;

    const body = (await request.json()) as ActionPayload;
    const { action, reason } = body;

    const validActions: InstructorAction[] = ['approve', 'reject', 'suspend', 'reinstate'];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    // Reject and suspend require a reason (optional but encouraged)
    let result: { success: boolean; error?: string };

    switch (action) {
      case 'approve':
        result = await approveInstructor(serviceSupabase, profileId, adminUser.id);
        break;
      case 'reject':
        result = await rejectInstructor(serviceSupabase, profileId, adminUser.id, reason);
        break;
      case 'suspend':
        result = await suspendInstructor(serviceSupabase, profileId, adminUser.id, reason);
        break;
      case 'reinstate':
        result = await reinstateInstructor(serviceSupabase, profileId, adminUser.id);
        break;
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log the admin action
    await logAdminAction(
      adminUser.id,
      `instructor_${action}`,
      'instructor_profile',
      profileId,
      reason ? { reason } : {},
      reason || null,
      request
    );

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return handleAdminError(error);
  }
}
