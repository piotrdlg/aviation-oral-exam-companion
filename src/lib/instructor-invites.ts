import 'server-only';
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export interface InviteResult {
  success: boolean;
  invite?: {
    id: string;
    token: string;
    inviteUrl: string;
    expiresAt: string;
  };
  error?: string;
}

export interface InviteInfo {
  id: string;
  instructorName: string;
  instructorCertType: string | null;
  expired: boolean;
  claimed: boolean;
  revoked: boolean;
}

export interface ClaimResult {
  success: boolean;
  connectionId?: string;
  error?: string;
}

// --- Constants ---

const TOKEN_BYTES = 24; // 48 hex chars — sufficient entropy for invite links
const DEFAULT_EXPIRY_DAYS = 30;

// --- Token Generation ---

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function buildInviteUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://aviation-oral-exam-companion.vercel.app';
  return `${base}/invite/${token}`;
}

// --- Invite CRUD ---

/**
 * Create a new invite link for an approved instructor.
 * Validates instructor status before generating.
 */
export async function createInviteLink(
  serviceSupabase: SupabaseClient,
  instructorUserId: string,
  options?: {
    targetEmail?: string;
    targetName?: string;
    expiryDays?: number;
  },
): Promise<InviteResult> {
  // Verify instructor is approved
  const { data: profile, error: profileError } = await serviceSupabase
    .from('instructor_profiles')
    .select('status')
    .eq('user_id', instructorUserId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Instructor profile not found' };
  }

  if (profile.status !== 'approved') {
    return { success: false, error: `Cannot create invites with status: ${profile.status}` };
  }

  const token = generateInviteToken();
  const expiryDays = options?.expiryDays ?? DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const { data: invite, error } = await serviceSupabase
    .from('instructor_invites')
    .insert({
      instructor_user_id: instructorUserId,
      invite_type: 'link',
      token,
      target_email: options?.targetEmail || null,
      target_name: options?.targetName || null,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token, expires_at')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    invite: {
      id: invite.id,
      token: invite.token,
      inviteUrl: buildInviteUrl(invite.token),
      expiresAt: invite.expires_at,
    },
  };
}

/**
 * List active invites for an instructor.
 */
export async function listInstructorInvites(
  serviceSupabase: SupabaseClient,
  instructorUserId: string,
): Promise<{ invites: Array<{
  id: string;
  token: string;
  inviteUrl: string;
  targetEmail: string | null;
  targetName: string | null;
  claimedByUserId: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}> }> {
  const { data, error } = await serviceSupabase
    .from('instructor_invites')
    .select('*')
    .eq('instructor_user_id', instructorUserId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[instructor-invites] List error:', error.message);
    return { invites: [] };
  }

  return {
    invites: (data || []).map((inv) => ({
      id: inv.id as string,
      token: inv.token as string,
      inviteUrl: buildInviteUrl(inv.token as string),
      targetEmail: inv.target_email as string | null,
      targetName: inv.target_name as string | null,
      claimedByUserId: inv.claimed_by_user_id as string | null,
      acceptedAt: inv.accepted_at as string | null,
      revokedAt: inv.revoked_at as string | null,
      expiresAt: inv.expires_at as string | null,
      createdAt: inv.created_at as string,
    })),
  };
}

/**
 * Revoke an invite (instructor can revoke their own).
 */
export async function revokeInvite(
  serviceSupabase: SupabaseClient,
  inviteId: string,
  instructorUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await serviceSupabase
    .from('instructor_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('instructor_user_id', instructorUserId)
    .is('revoked_at', null);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// --- Invite Lookup (public, for claim page) ---

/**
 * Look up an invite by token. Returns public-safe info for the claim page.
 * Does NOT require auth — the token itself is the proof of invitation.
 */
export async function lookupInvite(
  serviceSupabase: SupabaseClient,
  token: string,
): Promise<InviteInfo | null> {
  const { data: invite, error } = await serviceSupabase
    .from('instructor_invites')
    .select('id, instructor_user_id, expires_at, claimed_by_user_id, accepted_at, revoked_at')
    .eq('token', token)
    .single();

  if (error || !invite) return null;

  // Fetch instructor name
  const { data: profile } = await serviceSupabase
    .from('instructor_profiles')
    .select('first_name, last_name, certificate_type')
    .eq('user_id', invite.instructor_user_id)
    .single();

  const now = new Date();
  const expired = invite.expires_at ? new Date(invite.expires_at as string) < now : false;

  return {
    id: invite.id as string,
    instructorName: profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Your Instructor'
      : 'Your Instructor',
    instructorCertType: (profile?.certificate_type as string) || null,
    expired,
    claimed: !!(invite.claimed_by_user_id),
    revoked: !!(invite.revoked_at),
  };
}

// --- Invite Claiming ---

/**
 * Claim an invite: marks the invite as claimed and creates a connection.
 * Called after student authenticates.
 */
export async function claimInvite(
  serviceSupabase: SupabaseClient,
  token: string,
  studentUserId: string,
): Promise<ClaimResult> {
  // Look up invite
  const { data: invite, error: inviteError } = await serviceSupabase
    .from('instructor_invites')
    .select('id, instructor_user_id, expires_at, claimed_by_user_id, revoked_at')
    .eq('token', token)
    .single();

  if (inviteError || !invite) {
    return { success: false, error: 'Invite not found' };
  }

  // Validate invite state
  if (invite.revoked_at) {
    return { success: false, error: 'This invite has been revoked' };
  }

  if (invite.claimed_by_user_id) {
    // Allow re-claim by same user (idempotent)
    if (invite.claimed_by_user_id === studentUserId) {
      const { data: existingConn } = await serviceSupabase
        .from('student_instructor_connections')
        .select('id')
        .eq('instructor_user_id', invite.instructor_user_id)
        .eq('student_user_id', studentUserId)
        .single();
      return { success: true, connectionId: existingConn?.id as string };
    }
    return { success: false, error: 'This invite has already been claimed' };
  }

  if (invite.expires_at && new Date(invite.expires_at as string) < new Date()) {
    return { success: false, error: 'This invite has expired' };
  }

  // Prevent self-connection
  if (invite.instructor_user_id === studentUserId) {
    return { success: false, error: 'You cannot use your own invite' };
  }

  // Mark invite as claimed
  const { error: claimError } = await serviceSupabase
    .from('instructor_invites')
    .update({
      claimed_by_user_id: studentUserId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .is('claimed_by_user_id', null); // Optimistic lock

  if (claimError) {
    return { success: false, error: 'Failed to claim invite. It may have been claimed by someone else.' };
  }

  // Create or update connection
  const { data: connection, error: connError } = await serviceSupabase
    .from('student_instructor_connections')
    .upsert(
      {
        instructor_user_id: invite.instructor_user_id as string,
        student_user_id: studentUserId,
        state: 'connected',
        initiated_by: 'instructor',
        invite_id: invite.id as string,
        connection_source: 'invite_link',
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'instructor_user_id,student_user_id' },
    )
    .select('id')
    .single();

  if (connError) {
    return { success: false, error: connError.message };
  }

  return { success: true, connectionId: connection?.id as string };
}
