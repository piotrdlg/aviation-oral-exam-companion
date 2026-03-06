import 'server-only';

import { TtlCache } from './ttl-cache';
import { captureServerEvent } from './posthog-server';
import type {
  InstructorProgramStatus,
  CourtesyReason,
  InstructorEntitlementResult,
  SubscriptionStatus,
} from '@/types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subscription statuses that count as "paid-active". Default: active only. Trialing requires system_config override. */
const PAID_ACTIVE_STATUSES: SubscriptionStatus[] = ['active'];

/** TTL for entitlement cache: 60 seconds (meets <= 60s freshness requirement). */
const ENTITLEMENT_CACHE_TTL_MS = 60_000;

/** Tier granted to instructors with courtesy access. */
export const COURTESY_TIER = 'checkride_prep' as const;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const entitlementCache = new TtlCache<InstructorEntitlementResult>(ENTITLEMENT_CACHE_TTL_MS);

/** Clear cache for a specific user (useful after state changes). */
export function invalidateEntitlementCache(userId: string): void {
  entitlementCache.delete(userId);
}

/** Clear all cached entitlements. */
export function clearEntitlementCache(): void {
  entitlementCache.clear();
}

// ---------------------------------------------------------------------------
// System config helpers
// ---------------------------------------------------------------------------

/** Check if system_config has instructor.courtesy_counts_trialing enabled */
async function shouldCountTrialing(supabase: SupabaseClientLike): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'instructor')
      .single();

    if (!data?.value) return false;
    const config = data.value as Record<string, unknown>;
    return config.courtesy_counts_trialing === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the full entitlement state for a user in the instructor program.
 *
 * This is the **single source of truth** for whether an instructor has
 * courtesy access. All downstream consumers (tier gating, UI, admin)
 * should call this rather than computing eligibility independently.
 *
 * Eligibility rule:
 *   Instructor has courtesy access IF:
 *     - instructor_profiles.status == 'approved'
 *     AND (
 *       has >= 1 connected student with subscription_status IN ('active')
 *         (or 'trialing' when system_config.instructor.courtesy_counts_trialing is true)
 *       OR has >= 1 connected student with active paid_equivalent override
 *       OR has direct instructor_access_override with active=true and not expired
 *     )
 */
export async function resolveInstructorEntitlements(
  userId: string,
  opts: { supabaseClient: SupabaseClientLike; now?: Date }
): Promise<InstructorEntitlementResult> {
  const cached = entitlementCache.get(userId);
  if (cached) return cached;

  const supabase = opts.supabaseClient;
  const now = opts.now ?? new Date();

  // 1. Fetch instructor profile
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('status')
    .eq('user_id', userId)
    .single();

  if (!profile) {
    const result = buildResult('not_instructor');
    entitlementCache.set(userId, result);
    return result;
  }

  const status = profile.status as string;

  if (status === 'suspended') {
    const result = buildResult('suspended');
    entitlementCache.set(userId, result);
    return result;
  }

  if (status !== 'approved') {
    const result = buildResult('pending_approval');
    entitlementCache.set(userId, result);
    return result;
  }

  // 2. Approved instructor — check for courtesy access sources

  // Check if trialing should count (system_config override)
  const countsTrialing = await shouldCountTrialing(supabase);
  const effectivePaidStatuses: SubscriptionStatus[] = countsTrialing
    ? ['active', 'trialing']
    : PAID_ACTIVE_STATUSES;

  // 2a. Check direct instructor override (existing table)
  const { data: directOverrides } = await supabase
    .from('instructor_access_overrides')
    .select('id, active, expires_at')
    .eq('instructor_user_id', userId)
    .eq('active', true);

  const hasDirectOverride = (directOverrides || []).some(
    (o: { active: boolean; expires_at: string | null }) =>
      o.active && (!o.expires_at || new Date(o.expires_at) > now)
  );

  if (hasDirectOverride) {
    return cacheAndEmit(userId, buildResult('approved_with_courtesy', 'direct_override', 0, 0));
  }

  // 2b. Get connected students and their subscription status + overrides
  const { data: connections } = await supabase
    .from('student_instructor_connections')
    .select('student_user_id')
    .eq('instructor_user_id', userId)
    .eq('state', 'connected');

  const connectedStudentIds = (connections || []).map(
    (c: { student_user_id: string }) => c.student_user_id
  );

  if (connectedStudentIds.length === 0) {
    return cacheAndEmit(userId, buildResult('approved_no_courtesy', 'none', 0, 0));
  }

  // 2c. Check paid-active students (subscription_status in user_profiles)
  const { data: studentProfiles } = await supabase
    .from('user_profiles')
    .select('user_id, subscription_status')
    .in('user_id', connectedStudentIds);

  const paidStudentCount = (studentProfiles || []).filter(
    (p: { subscription_status: string | null }) =>
      effectivePaidStatuses.includes(p.subscription_status as SubscriptionStatus)
  ).length;

  if (paidStudentCount > 0) {
    return cacheAndEmit(
      userId,
      buildResult('approved_with_courtesy', 'paid_student', paidStudentCount, 0)
    );
  }

  // 2d. Check paid-equivalent overrides on connected students
  const { data: studentOverrides } = await supabase
    .from('user_entitlement_overrides')
    .select('user_id, active, expires_at')
    .in('user_id', connectedStudentIds)
    .eq('entitlement_key', 'paid_equivalent')
    .eq('active', true);

  const paidEquivalentStudentCount = (studentOverrides || []).filter(
    (o: { active: boolean; expires_at: string | null }) =>
      o.active && (!o.expires_at || new Date(o.expires_at) > now)
  ).length;

  if (paidEquivalentStudentCount > 0) {
    return cacheAndEmit(
      userId,
      buildResult('approved_with_courtesy', 'student_override', 0, paidEquivalentStudentCount)
    );
  }

  // 2e. No courtesy source found
  return cacheAndEmit(userId, buildResult('approved_no_courtesy', 'none', 0, 0));
}

/**
 * Check if a student is paid-active (has an active subscription by default).
 * Pass `countsTrialing = true` to also count 'trialing' as paid.
 */
export async function isStudentPaidActive(
  studentUserId: string,
  supabaseClient: SupabaseClientLike,
  countsTrialing = false,
): Promise<boolean> {
  const { data } = await supabaseClient
    .from('user_profiles')
    .select('subscription_status')
    .eq('user_id', studentUserId)
    .single();

  if (!data) return false;
  const effectiveStatuses: SubscriptionStatus[] = countsTrialing
    ? ['active', 'trialing']
    : PAID_ACTIVE_STATUSES;
  return effectiveStatuses.includes(data.subscription_status as SubscriptionStatus);
}

/**
 * Check if a user has a paid-equivalent admin override (active and not expired).
 */
export async function hasPaidEquivalentOverride(
  userId: string,
  supabaseClient: SupabaseClientLike,
  now?: Date
): Promise<boolean> {
  const currentTime = now ?? new Date();
  const { data } = await supabaseClient
    .from('user_entitlement_overrides')
    .select('active, expires_at')
    .eq('user_id', userId)
    .eq('entitlement_key', 'paid_equivalent')
    .eq('active', true)
    .single();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) <= currentTime) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cache the result and emit a PostHog event for approved instructor entitlements.
 * Only emits for instructors (skips not_instructor / pending).
 */
function cacheAndEmit(
  userId: string,
  result: InstructorEntitlementResult
): InstructorEntitlementResult {
  entitlementCache.set(userId, result);

  // Emit PostHog event for approved instructors (on cache miss only)
  if (result.instructorStatus.startsWith('approved')) {
    captureServerEvent(userId, 'instructor_courtesy_access_resolved', {
      instructorStatus: result.instructorStatus,
      hasCourtesyAccess: result.hasCourtesyAccess,
      courtesyReason: result.courtesyReason,
      paidStudentCount: result.paidStudentCount,
      paidEquivalentStudentCount: result.paidEquivalentStudentCount,
      effectiveTier: result.effectiveTierOverride ?? 'none',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

export function buildResult(
  instructorStatus: InstructorProgramStatus,
  courtesyReason: CourtesyReason = 'none',
  paidStudentCount = 0,
  paidEquivalentStudentCount = 0
): InstructorEntitlementResult {
  const hasCourtesyAccess =
    instructorStatus === 'approved_with_courtesy';

  return {
    isInstructor: instructorStatus !== 'not_instructor',
    instructorStatus,
    hasCourtesyAccess,
    courtesyReason,
    paidStudentCount,
    paidEquivalentStudentCount,
    effectiveTierOverride: hasCourtesyAccess ? COURTESY_TIER : null,
    cacheTTLSeconds: ENTITLEMENT_CACHE_TTL_MS / 1000,
  };
}

/** Exposed for testing / audit comparisons. Default: ['active'] only. */
export const PAID_ACTIVE_SUBSCRIPTION_STATUSES = PAID_ACTIVE_STATUSES;
