import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Types ---

export type InstructorStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';

export type CertificateType = 'CFI' | 'CFII' | 'MEI' | 'AGI' | 'IGI';

export type VerificationStatus = 'unverified' | 'verified_auto' | 'needs_manual_review' | 'verified_admin';

export type VerificationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface InstructorProfile {
  id: string;
  user_id: string;
  status: InstructorStatus;
  first_name: string | null;
  last_name: string | null;
  certificate_number: string | null;
  certificate_type: CertificateType | null;
  bio: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  admin_notes: string | null;
  verification_status: VerificationStatus;
  verification_source: string | null;
  verification_confidence: VerificationConfidence | null;
  verification_data: Record<string, unknown>;
  verification_attempted_at: string | null;
  auto_approved: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InstructorProgramState {
  featureEnabled: boolean;
  hasProfile: boolean;
  profile: InstructorProfile | null;
  applicationStatus: InstructorStatus | null;
  verificationStatus: VerificationStatus | null;
  verificationConfidence: VerificationConfidence | null;
  canActivate: boolean;       // Can submit/resubmit application
  canOpenInstructorMode: boolean;  // Has approved status
  canInviteStudents: boolean;      // Approved + can generate invites
  statusMessage: string;
}

// --- Feature Flag ---

/**
 * Check if the instructor partnership feature is enabled.
 * Uses the system_config table pattern.
 */
export async function isInstructorFeatureEnabled(
  serviceSupabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await serviceSupabase
    .from('system_config')
    .select('value')
    .eq('key', 'instructor_partnership_v1')
    .single();

  if (!data?.value) return false;
  return (data.value as { enabled?: boolean }).enabled === true;
}

// --- Profile Queries ---

/**
 * Fetch the instructor profile for a user. Returns null if no profile exists.
 */
export async function getInstructorProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<InstructorProfile | null> {
  const { data, error } = await supabase
    .from('instructor_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[instructor-access] Error fetching profile:', error.message);
    return null;
  }

  return data as InstructorProfile | null;
}

// --- State Resolution ---

/**
 * Get the application status for a user. Returns null if no profile.
 */
export async function getInstructorApplicationStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<InstructorStatus | null> {
  const profile = await getInstructorProfile(supabase, userId);
  return profile?.status ?? null;
}

/**
 * Check if a user has an approved instructor profile.
 */
export async function isInstructorApproved(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const status = await getInstructorApplicationStatus(supabase, userId);
  return status === 'approved';
}

/**
 * Determine if a user can open Instructor Mode.
 * Requires: feature enabled + approved status.
 */
export async function canOpenInstructorMode(
  serviceSupabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const [featureEnabled, status] = await Promise.all([
    isInstructorFeatureEnabled(serviceSupabase),
    getInstructorApplicationStatus(serviceSupabase, userId),
  ]);
  return featureEnabled && status === 'approved';
}

/**
 * Get the full instructor program state for a user.
 * This is the primary resolver for the Settings UI.
 */
export async function getInstructorProgramState(
  serviceSupabase: SupabaseClient,
  userId: string,
): Promise<InstructorProgramState> {
  const [featureEnabled, profile] = await Promise.all([
    isInstructorFeatureEnabled(serviceSupabase),
    getInstructorProfile(serviceSupabase, userId),
  ]);

  const status = profile?.status ?? null;

  // Can activate if: feature enabled AND (no profile, or profile is draft/rejected)
  const canActivate = featureEnabled && (!status || status === 'draft' || status === 'rejected');

  // Can open instructor mode if: feature enabled AND approved
  const canOpen = featureEnabled && status === 'approved';

  let statusMessage = '';
  if (!featureEnabled) {
    statusMessage = 'The Instructor Partnership program is not yet available.';
  } else if (!profile) {
    statusMessage = 'Activate Instructor Mode to connect with your students on HeyDPE.';
  } else {
    switch (status) {
      case 'draft':
        statusMessage = 'Your application is saved as a draft. Complete and submit when ready.';
        break;
      case 'pending':
        statusMessage = 'Your application is under review. We\'ll notify you when it\'s approved.';
        break;
      case 'approved':
        statusMessage = 'Your instructor account is active.';
        break;
      case 'rejected':
        statusMessage = profile.rejection_reason
          ? `Your application was not approved: ${profile.rejection_reason}`
          : 'Your application was not approved. You may reapply with updated information.';
        break;
      case 'suspended':
        statusMessage = profile.suspension_reason
          ? `Your instructor account has been suspended: ${profile.suspension_reason}`
          : 'Your instructor account has been suspended. Contact support for details.';
        break;
    }
  }

  return {
    featureEnabled,
    hasProfile: !!profile,
    profile,
    applicationStatus: status,
    verificationStatus: profile?.verification_status ?? null,
    verificationConfidence: profile?.verification_confidence ?? null,
    canActivate,
    canOpenInstructorMode: canOpen,
    canInviteStudents: canOpen, // Approved instructors can invite
    statusMessage,
  };
}

// --- Application Mutations (used by API routes) ---

/**
 * Verification data that can be attached during submission.
 * The verification itself runs in the API route; this type carries the result.
 */
export interface VerificationPayload {
  verificationStatus: VerificationStatus;
  verificationSource: string;
  verificationConfidence: VerificationConfidence;
  verificationData: Record<string, unknown>;
  verificationAttemptedAt: string;
}

/**
 * Submit an instructor application.
 * Creates or updates the profile. If verification is provided with HIGH confidence,
 * the profile is auto-approved immediately. Otherwise sets status to 'pending'.
 */
export async function submitInstructorApplication(
  serviceSupabase: SupabaseClient,
  userId: string,
  data: {
    firstName: string;
    lastName: string;
    certificateNumber: string;
    certificateType: CertificateType;
    bio?: string;
  },
  verification?: VerificationPayload,
): Promise<{ success: boolean; autoApproved?: boolean; error?: string }> {
  // Check if profile already exists
  const existing = await getInstructorProfile(serviceSupabase, userId);

  if (existing && existing.status !== 'draft' && existing.status !== 'rejected') {
    return { success: false, error: `Cannot submit application with status: ${existing.status}` };
  }

  // Determine if fast-path auto-approval applies
  // Rule: auto-approve ONLY when verification confidence is HIGH
  const autoApprove = verification?.verificationConfidence === 'high'
    && verification.verificationStatus === 'verified_auto';

  const now = new Date().toISOString();

  const profileData: Record<string, unknown> = {
    user_id: userId,
    first_name: data.firstName,
    last_name: data.lastName,
    certificate_number: data.certificateNumber,
    certificate_type: data.certificateType,
    bio: data.bio || null,
    status: autoApprove ? 'approved' : 'pending',
    submitted_at: now,
    // Verification fields
    ...(verification ? {
      verification_status: verification.verificationStatus,
      verification_source: verification.verificationSource,
      verification_confidence: verification.verificationConfidence,
      verification_data: verification.verificationData,
      verification_attempted_at: verification.verificationAttemptedAt,
      auto_approved: autoApprove,
    } : {}),
    // Auto-approval timestamps
    ...(autoApprove ? {
      approved_at: now,
      approved_by: null, // System auto-approval, not admin
    } : {}),
  };

  if (existing) {
    const { error } = await serviceSupabase
      .from('instructor_profiles')
      .update(profileData)
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await serviceSupabase
      .from('instructor_profiles')
      .insert(profileData);
    if (error) return { success: false, error: error.message };
  }

  return { success: true, autoApproved: autoApprove };
}

// --- Admin Mutations ---

/**
 * Approve an instructor application.
 */
export async function approveInstructor(
  serviceSupabase: SupabaseClient,
  profileId: string,
  adminUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: profile, error: fetchError } = await serviceSupabase
    .from('instructor_profiles')
    .select('status')
    .eq('id', profileId)
    .single();

  if (fetchError || !profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (profile.status !== 'pending') {
    return { success: false, error: `Cannot approve profile with status: ${profile.status}` };
  }

  const { error } = await serviceSupabase
    .from('instructor_profiles')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: adminUserId,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    })
    .eq('id', profileId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Reject an instructor application.
 */
export async function rejectInstructor(
  serviceSupabase: SupabaseClient,
  profileId: string,
  adminUserId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: profile, error: fetchError } = await serviceSupabase
    .from('instructor_profiles')
    .select('status')
    .eq('id', profileId)
    .single();

  if (fetchError || !profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (profile.status !== 'pending') {
    return { success: false, error: `Cannot reject profile with status: ${profile.status}` };
  }

  const { error } = await serviceSupabase
    .from('instructor_profiles')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: adminUserId,
      rejection_reason: reason || null,
    })
    .eq('id', profileId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Suspend an approved instructor.
 */
export async function suspendInstructor(
  serviceSupabase: SupabaseClient,
  profileId: string,
  adminUserId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: profile, error: fetchError } = await serviceSupabase
    .from('instructor_profiles')
    .select('status')
    .eq('id', profileId)
    .single();

  if (fetchError || !profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (profile.status !== 'approved') {
    return { success: false, error: `Cannot suspend profile with status: ${profile.status}` };
  }

  const { error } = await serviceSupabase
    .from('instructor_profiles')
    .update({
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspended_by: adminUserId,
      suspension_reason: reason || null,
    })
    .eq('id', profileId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Reinstate a suspended instructor.
 */
export async function reinstateInstructor(
  serviceSupabase: SupabaseClient,
  profileId: string,
  adminUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: profile, error: fetchError } = await serviceSupabase
    .from('instructor_profiles')
    .select('status')
    .eq('id', profileId)
    .single();

  if (fetchError || !profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (profile.status !== 'suspended') {
    return { success: false, error: `Cannot reinstate profile with status: ${profile.status}` };
  }

  const { error } = await serviceSupabase
    .from('instructor_profiles')
    .update({
      status: 'approved',
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
      approved_at: new Date().toISOString(),
      approved_by: adminUserId,
    })
    .eq('id', profileId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
