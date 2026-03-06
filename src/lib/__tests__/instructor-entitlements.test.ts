import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

// Mock posthog-server
vi.mock('@/lib/posthog-server', () => ({
  captureServerEvent: vi.fn(),
}));

// --- Supabase mock helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: any };

function mockChain(result: MockResult) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  // Allow the chain itself to resolve for non-.single() terminations
  Object.defineProperty(chain, 'then', {
    value: (cb: (val: MockResult) => void) => Promise.resolve(cb(result)),
    writable: true,
    configurable: true,
  });
  return chain;
}

/**
 * Creates a mock Supabase that returns different results for successive
 * calls to the same table, or different results per table.
 * `tableSequences` maps table name -> array of results; each call pops the next.
 */
function createSequenceMockSupabase(
  tableSequences: Record<string, MockResult[]>,
) {
  const counters: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      counters[table] = counters[table] || 0;
      const seq = tableSequences[table] || [{ data: null, error: null }];
      const result = seq[counters[table]] ?? seq[seq.length - 1];
      counters[table]++;
      return mockChain(result);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// --- Imports (after mocks) ---

import {
  buildResult,
  resolveInstructorEntitlements,
  isStudentPaidActive,
  hasPaidEquivalentOverride,
  invalidateEntitlementCache,
  clearEntitlementCache,
  COURTESY_TIER,
  PAID_ACTIVE_SUBSCRIPTION_STATUSES,
} from '../instructor-entitlements';

// --- Constants ---

const INSTRUCTOR_USER_ID = 'instructor-001';
const STUDENT_USER_ID_1 = 'student-001';
const STUDENT_USER_ID_2 = 'student-002';
const STUDENT_USER_ID_3 = 'student-003';
const NOW = new Date('2026-03-05T12:00:00Z');
const FUTURE = '2026-12-31T23:59:59Z';
const PAST = '2025-01-01T00:00:00Z';

// ================================================================
// TESTS
// ================================================================

describe('instructor-entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEntitlementCache();
  });

  // ---------------------------------------------------------------
  // Group 1: buildResult (pure function)
  // ---------------------------------------------------------------
  describe('buildResult', () => {
    it('not_instructor → isInstructor: false, hasCourtesyAccess: false', () => {
      const result = buildResult('not_instructor');
      expect(result.isInstructor).toBe(false);
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.instructorStatus).toBe('not_instructor');
      expect(result.effectiveTierOverride).toBeNull();
    });

    it('pending_approval → isInstructor: true, hasCourtesyAccess: false', () => {
      const result = buildResult('pending_approval');
      expect(result.isInstructor).toBe(true);
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.instructorStatus).toBe('pending_approval');
      expect(result.effectiveTierOverride).toBeNull();
    });

    it('suspended → isInstructor: true, hasCourtesyAccess: false', () => {
      const result = buildResult('suspended');
      expect(result.isInstructor).toBe(true);
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.instructorStatus).toBe('suspended');
      expect(result.effectiveTierOverride).toBeNull();
    });

    it('approved_no_courtesy → hasCourtesyAccess: false, effectiveTierOverride: null', () => {
      const result = buildResult('approved_no_courtesy');
      expect(result.isInstructor).toBe(true);
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.effectiveTierOverride).toBeNull();
      expect(result.courtesyReason).toBe('none');
    });

    it('approved_with_courtesy + paid_student → hasCourtesyAccess: true, courtesyReason: paid_student, effectiveTierOverride: checkride_prep', () => {
      const result = buildResult('approved_with_courtesy', 'paid_student', 2, 0);
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('paid_student');
      expect(result.effectiveTierOverride).toBe('checkride_prep');
      expect(result.paidStudentCount).toBe(2);
      expect(result.paidEquivalentStudentCount).toBe(0);
    });

    it('approved_with_courtesy + student_override → courtesyReason: student_override', () => {
      const result = buildResult('approved_with_courtesy', 'student_override', 0, 1);
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('student_override');
      expect(result.effectiveTierOverride).toBe('checkride_prep');
      expect(result.paidStudentCount).toBe(0);
      expect(result.paidEquivalentStudentCount).toBe(1);
    });

    it('approved_with_courtesy + direct_override → courtesyReason: direct_override', () => {
      const result = buildResult('approved_with_courtesy', 'direct_override', 0, 0);
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('direct_override');
      expect(result.effectiveTierOverride).toBe('checkride_prep');
    });
  });

  // ---------------------------------------------------------------
  // Group 2: resolveInstructorEntitlements
  // ---------------------------------------------------------------
  describe('resolveInstructorEntitlements', () => {
    it('no profile → not_instructor', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: null, error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('not_instructor');
      expect(result.isInstructor).toBe(false);
      expect(result.hasCourtesyAccess).toBe(false);
    });

    it('profile with status=pending → pending_approval', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'pending' }, error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('pending_approval');
      expect(result.isInstructor).toBe(true);
      expect(result.hasCourtesyAccess).toBe(false);
    });

    it('profile with status=suspended → suspended', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'suspended' }, error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('suspended');
      expect(result.isInstructor).toBe(true);
      expect(result.hasCourtesyAccess).toBe(false);
    });

    it('approved + active direct override → approved_with_courtesy, direct_override', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [
          {
            data: [{ id: 'ovr-1', active: true, expires_at: FUTURE }],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_with_courtesy');
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('direct_override');
      expect(result.effectiveTierOverride).toBe('checkride_prep');
    });

    it('approved + expired direct override → falls through to student check', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [
          {
            data: [{ id: 'ovr-1', active: true, expires_at: PAST }],
            error: null,
          },
        ],
        student_instructor_connections: [{ data: [], error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      // Falls through expired override to no-connections path
      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
    });

    it('approved + no connections → approved_no_courtesy', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [{ data: [], error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.paidStudentCount).toBe(0);
    });

    it('approved + connected student with subscription_status=active → approved_with_courtesy, paid_student', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'active' }],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_with_courtesy');
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('paid_student');
      expect(result.paidStudentCount).toBe(1);
    });

    it('approved + connected student with subscription_status=trialing → NOT paid by default (no courtesy)', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        system_config: [{ data: null, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'trialing' }],
            error: null,
          },
        ],
        user_entitlement_overrides: [{ data: [], error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.paidStudentCount).toBe(0);
    });

    it('approved + connected student with subscription_status=canceled → not paid (falls through)', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'canceled' }],
            error: null,
          },
        ],
        user_entitlement_overrides: [{ data: [], error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      // Canceled student doesn't count as paid — falls through to overrides then no_courtesy
      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.paidStudentCount).toBe(0);
    });

    it('approved + connected student with paid_equivalent override → approved_with_courtesy, student_override', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'canceled' }],
            error: null,
          },
        ],
        user_entitlement_overrides: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, active: true, expires_at: FUTURE }],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_with_courtesy');
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('student_override');
      expect(result.paidEquivalentStudentCount).toBe(1);
    });

    it('approved + connected student with expired paid_equivalent override → approved_no_courtesy', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'canceled' }],
            error: null,
          },
        ],
        user_entitlement_overrides: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, active: true, expires_at: PAST }],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.paidEquivalentStudentCount).toBe(0);
    });

    it('approved + multiple students, mix of paid and unpaid → paidStudentCount correct (trialing not counted by default)', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        system_config: [{ data: null, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          {
            data: [
              { student_user_id: STUDENT_USER_ID_1 },
              { student_user_id: STUDENT_USER_ID_2 },
              { student_user_id: STUDENT_USER_ID_3 },
            ],
            error: null,
          },
        ],
        user_profiles: [
          {
            data: [
              { user_id: STUDENT_USER_ID_1, subscription_status: 'active' },
              { user_id: STUDENT_USER_ID_2, subscription_status: 'canceled' },
              { user_id: STUDENT_USER_ID_3, subscription_status: 'trialing' },
            ],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_with_courtesy');
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('paid_student');
      // student-001 (active) = 1 paid; student-003 (trialing) NOT counted by default
      expect(result.paidStudentCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // Group 2b: trialing override via system_config
  // ---------------------------------------------------------------
  describe('trialing override via system_config', () => {
    it('approved + trialing student + courtesy_counts_trialing=true → counts as paid', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        system_config: [
          {
            data: { value: { courtesy_counts_trialing: true } },
            error: null,
          },
        ],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'trialing' }],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_with_courtesy');
      expect(result.hasCourtesyAccess).toBe(true);
      expect(result.courtesyReason).toBe('paid_student');
      expect(result.paidStudentCount).toBe(1);
    });

    it('approved + trialing student + no config row → trialing NOT counted', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        system_config: [{ data: null, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'trialing' }],
            error: null,
          },
        ],
        user_entitlement_overrides: [{ data: [], error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.paidStudentCount).toBe(0);
    });

    it('approved + trialing student + courtesy_counts_trialing=false → trialing NOT counted', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        system_config: [
          {
            data: { value: { courtesy_counts_trialing: false } },
            error: null,
          },
        ],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [{ user_id: STUDENT_USER_ID_1, subscription_status: 'trialing' }],
            error: null,
          },
        ],
        user_entitlement_overrides: [{ data: [], error: null }],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result.instructorStatus).toBe('approved_no_courtesy');
      expect(result.hasCourtesyAccess).toBe(false);
      expect(result.paidStudentCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Group 3: isStudentPaidActive
  // ---------------------------------------------------------------
  describe('isStudentPaidActive', () => {
    it('active → true', async () => {
      const sb = createSequenceMockSupabase({
        user_profiles: [
          { data: { subscription_status: 'active' }, error: null },
        ],
      });

      const result = await isStudentPaidActive(STUDENT_USER_ID_1, sb);
      expect(result).toBe(true);
    });

    it('trialing → false (default)', async () => {
      const sb = createSequenceMockSupabase({
        user_profiles: [
          { data: { subscription_status: 'trialing' }, error: null },
        ],
      });

      const result = await isStudentPaidActive(STUDENT_USER_ID_1, sb);
      expect(result).toBe(false);
    });

    it('trialing → true when countsTrialing=true', async () => {
      const sb = createSequenceMockSupabase({
        user_profiles: [
          { data: { subscription_status: 'trialing' }, error: null },
        ],
      });

      const result = await isStudentPaidActive(STUDENT_USER_ID_1, sb, true);
      expect(result).toBe(true);
    });

    it('canceled → false', async () => {
      const sb = createSequenceMockSupabase({
        user_profiles: [
          { data: { subscription_status: 'canceled' }, error: null },
        ],
      });

      const result = await isStudentPaidActive(STUDENT_USER_ID_1, sb);
      expect(result).toBe(false);
    });

    it('no profile (null data) → false', async () => {
      const sb = createSequenceMockSupabase({
        user_profiles: [{ data: null, error: null }],
      });

      const result = await isStudentPaidActive(STUDENT_USER_ID_1, sb);
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Group 4: hasPaidEquivalentOverride
  // ---------------------------------------------------------------
  describe('hasPaidEquivalentOverride', () => {
    it('active override with future expiry → true', async () => {
      const sb = createSequenceMockSupabase({
        user_entitlement_overrides: [
          { data: { active: true, expires_at: FUTURE }, error: null },
        ],
      });

      const result = await hasPaidEquivalentOverride(STUDENT_USER_ID_1, sb, NOW);
      expect(result).toBe(true);
    });

    it('expired override → false', async () => {
      const sb = createSequenceMockSupabase({
        user_entitlement_overrides: [
          { data: { active: true, expires_at: PAST }, error: null },
        ],
      });

      const result = await hasPaidEquivalentOverride(STUDENT_USER_ID_1, sb, NOW);
      expect(result).toBe(false);
    });

    it('no override (null data) → false', async () => {
      const sb = createSequenceMockSupabase({
        user_entitlement_overrides: [{ data: null, error: null }],
      });

      const result = await hasPaidEquivalentOverride(STUDENT_USER_ID_1, sb, NOW);
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Group 5: Cache behavior
  // ---------------------------------------------------------------
  describe('cache behavior', () => {
    it('second call returns cached result (Supabase not called twice)', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: null, error: null }],
      });

      const result1 = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });
      const result2 = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      expect(result1).toEqual(result2);
      // from() should only be called once (for the first resolution)
      expect(sb.from).toHaveBeenCalledTimes(1);
    });

    it('after invalidateEntitlementCache, re-fetches from Supabase', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      });

      // First call — populates cache
      await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });
      expect(sb.from).toHaveBeenCalledTimes(1);

      // Invalidate and call again — should re-fetch
      invalidateEntitlementCache(INSTRUCTOR_USER_ID);

      await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });
      expect(sb.from).toHaveBeenCalledTimes(2);
    });

    it('clearEntitlementCache clears all cached entries', async () => {
      // Resolve for two different users
      const sb1 = createSequenceMockSupabase({
        instructor_profiles: [{ data: null, error: null }],
      });
      const sb2 = createSequenceMockSupabase({
        instructor_profiles: [{ data: null, error: null }],
      });

      await resolveInstructorEntitlements('user-a', {
        supabaseClient: sb1,
        now: NOW,
      });
      await resolveInstructorEntitlements('user-b', {
        supabaseClient: sb2,
        now: NOW,
      });

      expect(sb1.from).toHaveBeenCalledTimes(1);
      expect(sb2.from).toHaveBeenCalledTimes(1);

      // Clear all
      clearEntitlementCache();

      // Both should re-fetch
      const sb3 = createSequenceMockSupabase({
        instructor_profiles: [{ data: null, error: null }],
      });
      const sb4 = createSequenceMockSupabase({
        instructor_profiles: [{ data: null, error: null }],
      });

      await resolveInstructorEntitlements('user-a', {
        supabaseClient: sb3,
        now: NOW,
      });
      await resolveInstructorEntitlements('user-b', {
        supabaseClient: sb4,
        now: NOW,
      });

      expect(sb3.from).toHaveBeenCalledTimes(1);
      expect(sb4.from).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // Group 6: Feature flag integration (constants)
  // ---------------------------------------------------------------
  describe('feature flag integration', () => {
    it('COURTESY_TIER equals checkride_prep', () => {
      expect(COURTESY_TIER).toBe('checkride_prep');
    });

    it('PAID_ACTIVE_SUBSCRIPTION_STATUSES contains only [active] by default', () => {
      expect(PAID_ACTIVE_SUBSCRIPTION_STATUSES).toEqual(['active']);
      expect(PAID_ACTIVE_SUBSCRIPTION_STATUSES).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // Group 7: Privacy
  // ---------------------------------------------------------------
  describe('privacy', () => {
    it('entitlement result does not contain student subscription plan names', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_USER_ID_1 }], error: null },
        ],
        user_profiles: [
          {
            data: [
              {
                user_id: STUDENT_USER_ID_1,
                subscription_status: 'active',
                stripe_price_id: 'price_secret_123',
                stripe_product_id: 'prod_secret_456',
              },
            ],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('price_secret_123');
      expect(serialized).not.toContain('prod_secret_456');
      expect(serialized).not.toContain('stripe_price_id');
      expect(serialized).not.toContain('stripe_product_id');
    });

    it('entitlement result does not contain student email', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [{ data: { status: 'approved' }, error: null }],
        instructor_access_overrides: [{ data: [], error: null }],
        student_instructor_connections: [
          {
            data: [
              {
                student_user_id: STUDENT_USER_ID_1,
                student_email: 'student@example.com',
              },
            ],
            error: null,
          },
        ],
        user_profiles: [
          {
            data: [
              {
                user_id: STUDENT_USER_ID_1,
                subscription_status: 'active',
                email: 'student@example.com',
              },
            ],
            error: null,
          },
        ],
      });

      const result = await resolveInstructorEntitlements(INSTRUCTOR_USER_ID, {
        supabaseClient: sb,
        now: NOW,
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('student@example.com');
      expect(serialized).not.toContain('email');
    });
  });
});
