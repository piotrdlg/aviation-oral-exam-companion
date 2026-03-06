import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  getInstructorProgramState,
  submitInstructorApplication,
  isInstructorFeatureEnabled,
} from '@/lib/instructor-access';
import type { CertificateType, VerificationPayload } from '@/lib/instructor-access';
import { verifyInstructor } from '@/lib/instructor-verification';
import { resolveInstructorEntitlements } from '@/lib/instructor-entitlements';
import { ensureInstructorIdentity } from '@/lib/instructor-identity';

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_CERTIFICATE_TYPES: CertificateType[] = ['CFI', 'CFII', 'MEI', 'AGI', 'IGI'];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [state, entitlements] = await Promise.all([
      getInstructorProgramState(serviceSupabase, user.id),
      resolveInstructorEntitlements(user.id, { supabaseClient: serviceSupabase }),
    ]);

    // Ensure slug + referral code exist for approved instructors (lazy backfill)
    let identity: { slug: string; referralCode: string } | null = null;
    if (state.profile?.status === 'approved' && (!state.profile.slug || !state.profile.referral_code)) {
      identity = await ensureInstructorIdentity(serviceSupabase, user.id);
    }

    return NextResponse.json({
      ...state,
      hasCourtesyAccess: entitlements.hasCourtesyAccess,
      courtesyReason: entitlements.courtesyReason,
      paidStudentCount: entitlements.paidStudentCount,
      // Include identity (prefer freshly generated, fall back to profile data)
      slug: identity?.slug ?? state.profile?.slug ?? null,
      referralCode: identity?.referralCode ?? state.profile?.referral_code ?? null,
    });
  } catch (err) {
    console.error('[instructor] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check feature flag first
    const featureEnabled = await isInstructorFeatureEnabled(serviceSupabase);
    if (!featureEnabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { firstName, lastName, certificateNumber, certificateType } = body;

    // Validate firstName
    if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }
    if (firstName.trim().length > 100) {
      return NextResponse.json({ error: 'First name must be 100 characters or less' }, { status: 400 });
    }

    // Validate lastName
    if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
      return NextResponse.json({ error: 'Last name is required' }, { status: 400 });
    }
    if (lastName.trim().length > 100) {
      return NextResponse.json({ error: 'Last name must be 100 characters or less' }, { status: 400 });
    }

    // Validate certificateNumber
    if (!certificateNumber || typeof certificateNumber !== 'string' || certificateNumber.trim().length === 0) {
      return NextResponse.json({ error: 'Certificate number is required' }, { status: 400 });
    }
    if (certificateNumber.trim().length > 50) {
      return NextResponse.json({ error: 'Certificate number must be 50 characters or less' }, { status: 400 });
    }

    // Validate certificateType
    if (!certificateType || !VALID_CERTIFICATE_TYPES.includes(certificateType as CertificateType)) {
      return NextResponse.json(
        { error: `Certificate type must be one of: ${VALID_CERTIFICATE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const trimmedData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      certificateNumber: certificateNumber.trim(),
      certificateType: certificateType as CertificateType,
    };

    // Run FAA verification
    let verification: VerificationPayload | undefined;
    try {
      const vResult = await verifyInstructor(serviceSupabase, {
        firstName: trimmedData.firstName,
        lastName: trimmedData.lastName,
        certificateNumber: trimmedData.certificateNumber,
        certificateType: trimmedData.certificateType,
      });

      // Map verification module status to profile status:
      // 'no_match' → 'unverified' (profile column doesn't have 'no_match')
      const profileVerificationStatus =
        vResult.status === 'no_match' ? 'unverified' as const : vResult.status;

      verification = {
        verificationStatus: profileVerificationStatus,
        verificationSource: vResult.dataSource,
        verificationConfidence: vResult.confidence,
        verificationData: {
          candidates: vResult.candidates,
          reasonCodes: vResult.reasonCodes,
          explanation: vResult.explanation,
        },
        verificationAttemptedAt: vResult.attemptedAt,
      };
    } catch (err) {
      // Verification failure should not block submission — fall through to manual review
      console.error('[instructor] Verification error (non-blocking):', err);
    }

    const result = await submitInstructorApplication(
      serviceSupabase,
      user.id,
      trimmedData,
      verification,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      autoApproved: result.autoApproved ?? false,
    });
  } catch (err) {
    console.error('[instructor] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
