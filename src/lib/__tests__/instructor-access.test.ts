import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));
vi.mock('../instructor-identity', () => ({
  ensureInstructorIdentity: vi.fn().mockResolvedValue({ slug: 'test', referralCode: 'TEST1234' }),
}));

// --- Supabase mock helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: unknown };

function mockChain(result: MockResult) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.insert = vi.fn().mockResolvedValue(result);
  chain.update = vi.fn().mockReturnValue(chain);
  return chain;
}

function createMockSupabase(tables: Record<string, MockResult>) {
  return {
    from: vi.fn((table: string) => {
      const result = tables[table] || { data: null, error: null };
      return mockChain(result);
    }),
  } as never;
}

// --- Imports (after mocks) ---

import {
  isInstructorFeatureEnabled,
  getInstructorProfile,
  getInstructorApplicationStatus,
  isInstructorApproved,
  canOpenInstructorMode,
  getInstructorProgramState,
  submitInstructorApplication,
  approveInstructor,
  rejectInstructor,
  suspendInstructor,
  reinstateInstructor,
  type InstructorProfile,
} from '../instructor-access';

// --- Test Fixtures ---

const MOCK_USER_ID = 'user-123';
const MOCK_ADMIN_ID = 'admin-456';
const MOCK_PROFILE_ID = 'profile-789';

function makeProfile(overrides: Partial<InstructorProfile> = {}): InstructorProfile {
  return {
    id: MOCK_PROFILE_ID,
    user_id: MOCK_USER_ID,
    status: 'draft',
    first_name: 'John',
    last_name: 'Smith',
    certificate_number: '1234567',
    certificate_type: 'CFI',
    bio: null,
    slug: null,
    referral_code: null,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
    admin_notes: null,
    verification_status: 'unverified',
    verification_source: null,
    verification_confidence: null,
    verification_data: {},
    verification_attempted_at: null,
    auto_approved: false,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ================================================================
// TESTS
// ================================================================

describe('instructor-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Feature Flag
  // ---------------------------------------------------------------
  describe('isInstructorFeatureEnabled', () => {
    it('returns true when flag is enabled', async () => {
      const sb = createMockSupabase({
        system_config: { data: { value: { enabled: true } }, error: null },
      });
      expect(await isInstructorFeatureEnabled(sb)).toBe(true);
    });

    it('returns false when flag is disabled', async () => {
      const sb = createMockSupabase({
        system_config: { data: { value: { enabled: false } }, error: null },
      });
      expect(await isInstructorFeatureEnabled(sb)).toBe(false);
    });

    it('returns false when flag is missing', async () => {
      const sb = createMockSupabase({
        system_config: { data: null, error: null },
      });
      expect(await isInstructorFeatureEnabled(sb)).toBe(false);
    });

    it('returns false when value has no enabled field', async () => {
      const sb = createMockSupabase({
        system_config: { data: { value: {} }, error: null },
      });
      expect(await isInstructorFeatureEnabled(sb)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Profile Queries
  // ---------------------------------------------------------------
  describe('getInstructorProfile', () => {
    it('returns profile when found', async () => {
      const profile = makeProfile({ status: 'approved' });
      const sb = createMockSupabase({
        instructor_profiles: { data: profile, error: null },
      });
      const result = await getInstructorProfile(sb, MOCK_USER_ID);
      expect(result).toEqual(profile);
    });

    it('returns null when no profile exists', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: null },
      });
      const result = await getInstructorProfile(sb, MOCK_USER_ID);
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: { message: 'DB error' } },
      });
      const result = await getInstructorProfile(sb, MOCK_USER_ID);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Application Status
  // ---------------------------------------------------------------
  describe('getInstructorApplicationStatus', () => {
    it('returns status when profile exists', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: makeProfile({ status: 'pending' }), error: null },
      });
      expect(await getInstructorApplicationStatus(sb, MOCK_USER_ID)).toBe('pending');
    });

    it('returns null when no profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: null },
      });
      expect(await getInstructorApplicationStatus(sb, MOCK_USER_ID)).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // isInstructorApproved
  // ---------------------------------------------------------------
  describe('isInstructorApproved', () => {
    it('returns true for approved status', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: makeProfile({ status: 'approved' }), error: null },
      });
      expect(await isInstructorApproved(sb, MOCK_USER_ID)).toBe(true);
    });

    it.each(['draft', 'pending', 'rejected', 'suspended'] as const)(
      'returns false for %s status',
      async (status) => {
        const sb = createMockSupabase({
          instructor_profiles: { data: makeProfile({ status }), error: null },
        });
        expect(await isInstructorApproved(sb, MOCK_USER_ID)).toBe(false);
      },
    );

    it('returns false when no profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: null },
      });
      expect(await isInstructorApproved(sb, MOCK_USER_ID)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // canOpenInstructorMode
  // ---------------------------------------------------------------
  describe('canOpenInstructorMode', () => {
    it('returns true when feature enabled AND approved', async () => {
      // Need both system_config and instructor_profiles queries
      const sb = {
        from: vi.fn((table: string) => {
          if (table === 'system_config') {
            return mockChain({ data: { value: { enabled: true } }, error: null });
          }
          return mockChain({ data: makeProfile({ status: 'approved' }), error: null });
        }),
      } as never;
      expect(await canOpenInstructorMode(sb, MOCK_USER_ID)).toBe(true);
    });

    it('returns false when feature disabled', async () => {
      const sb = {
        from: vi.fn((table: string) => {
          if (table === 'system_config') {
            return mockChain({ data: { value: { enabled: false } }, error: null });
          }
          return mockChain({ data: makeProfile({ status: 'approved' }), error: null });
        }),
      } as never;
      expect(await canOpenInstructorMode(sb, MOCK_USER_ID)).toBe(false);
    });

    it('returns false when pending (not approved)', async () => {
      const sb = {
        from: vi.fn((table: string) => {
          if (table === 'system_config') {
            return mockChain({ data: { value: { enabled: true } }, error: null });
          }
          return mockChain({ data: makeProfile({ status: 'pending' }), error: null });
        }),
      } as never;
      expect(await canOpenInstructorMode(sb, MOCK_USER_ID)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // getInstructorProgramState
  // ---------------------------------------------------------------
  describe('getInstructorProgramState', () => {
    function makeStateSb(featureEnabled: boolean, profile: InstructorProfile | null) {
      return {
        from: vi.fn((table: string) => {
          if (table === 'system_config') {
            return mockChain({ data: { value: { enabled: featureEnabled } }, error: null });
          }
          return mockChain({ data: profile, error: null });
        }),
      } as never;
    }

    it('feature disabled — cannot activate or open', async () => {
      const state = await getInstructorProgramState(makeStateSb(false, null), MOCK_USER_ID);
      expect(state.featureEnabled).toBe(false);
      expect(state.canActivate).toBe(false);
      expect(state.canOpenInstructorMode).toBe(false);
      expect(state.statusMessage).toContain('not yet available');
    });

    it('feature enabled, no profile — can activate', async () => {
      const state = await getInstructorProgramState(makeStateSb(true, null), MOCK_USER_ID);
      expect(state.featureEnabled).toBe(true);
      expect(state.hasProfile).toBe(false);
      expect(state.canActivate).toBe(true);
      expect(state.canOpenInstructorMode).toBe(false);
      expect(state.statusMessage).toContain('Activate Instructor Mode');
    });

    it('draft status — can activate', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'draft' })),
        MOCK_USER_ID,
      );
      expect(state.canActivate).toBe(true);
      expect(state.canOpenInstructorMode).toBe(false);
      expect(state.statusMessage).toContain('draft');
    });

    it('pending status — cannot activate or open', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'pending' })),
        MOCK_USER_ID,
      );
      expect(state.canActivate).toBe(false);
      expect(state.canOpenInstructorMode).toBe(false);
      expect(state.statusMessage).toContain('under review');
    });

    it('approved status — can open instructor mode', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'approved' })),
        MOCK_USER_ID,
      );
      expect(state.canActivate).toBe(false);
      expect(state.canOpenInstructorMode).toBe(true);
      expect(state.statusMessage).toContain('active');
    });

    it('rejected status — can reapply', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'rejected', rejection_reason: 'Invalid cert' })),
        MOCK_USER_ID,
      );
      expect(state.canActivate).toBe(true);
      expect(state.canOpenInstructorMode).toBe(false);
      expect(state.statusMessage).toContain('Invalid cert');
    });

    it('rejected without reason — shows generic message', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'rejected', rejection_reason: null })),
        MOCK_USER_ID,
      );
      expect(state.statusMessage).toContain('reapply');
    });

    it('suspended status — cannot activate or open', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'suspended', suspension_reason: 'Policy violation' })),
        MOCK_USER_ID,
      );
      expect(state.canActivate).toBe(false);
      expect(state.canOpenInstructorMode).toBe(false);
      expect(state.statusMessage).toContain('Policy violation');
    });

    it('suspended without reason — shows generic message', async () => {
      const state = await getInstructorProgramState(
        makeStateSb(true, makeProfile({ status: 'suspended', suspension_reason: null })),
        MOCK_USER_ID,
      );
      expect(state.statusMessage).toContain('Contact support');
    });
  });

  // ---------------------------------------------------------------
  // submitInstructorApplication
  // ---------------------------------------------------------------
  describe('submitInstructorApplication', () => {
    const validData = {
      firstName: 'Jane',
      lastName: 'Doe',
      certificateNumber: '9876543',
      certificateType: 'CFII' as const,
    };

    it('creates new profile when none exists', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: insertMock,
          update: vi.fn(),
        })),
      } as never;

      const result = await submitInstructorApplication(sb, MOCK_USER_ID, validData);
      expect(result.success).toBe(true);
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: MOCK_USER_ID,
          first_name: 'Jane',
          last_name: 'Doe',
          certificate_number: '9876543',
          certificate_type: 'CFII',
          status: 'pending',
        }),
      );
    });

    it('updates existing draft profile', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: makeProfile({ status: 'draft' }),
                error: null,
              }),
            }),
          }),
          insert: vi.fn(),
          update: updateMock,
        })),
      } as never;

      const result = await submitInstructorApplication(sb, MOCK_USER_ID, validData);
      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalled();
    });

    it('allows resubmission from rejected status', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: makeProfile({ status: 'rejected' }),
                error: null,
              }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await submitInstructorApplication(sb, MOCK_USER_ID, validData);
      expect(result.success).toBe(true);
    });

    it.each(['pending', 'approved', 'suspended'] as const)(
      'rejects submission from %s status',
      async (status) => {
        const sb = createMockSupabase({
          instructor_profiles: { data: makeProfile({ status }), error: null },
        });
        const result = await submitInstructorApplication(sb, MOCK_USER_ID, validData);
        expect(result.success).toBe(false);
        expect(result.error).toContain(status);
      },
    );
  });

  // ---------------------------------------------------------------
  // Admin: approveInstructor
  // ---------------------------------------------------------------
  describe('approveInstructor', () => {
    it('approves a pending profile', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { status: 'pending' }, error: null }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await approveInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('rejects approval of non-pending profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'draft' }, error: null },
      });
      const result = await approveInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('draft');
    });

    it('returns error for missing profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: { message: 'not found' } },
      });
      const result = await approveInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ---------------------------------------------------------------
  // Admin: rejectInstructor
  // ---------------------------------------------------------------
  describe('rejectInstructor', () => {
    it('rejects a pending profile with reason', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { status: 'pending' }, error: null }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await rejectInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID, 'Invalid certificate');
      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', rejection_reason: 'Invalid certificate' }),
      );
    });

    it('rejects without reason stores null', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { status: 'pending' }, error: null }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await rejectInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ rejection_reason: null }),
      );
    });

    it('cannot reject non-pending profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'approved' }, error: null },
      });
      const result = await rejectInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Admin: suspendInstructor
  // ---------------------------------------------------------------
  describe('suspendInstructor', () => {
    it('suspends an approved profile', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { status: 'approved' }, error: null }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await suspendInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID, 'Policy violation');
      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended', suspension_reason: 'Policy violation' }),
      );
    });

    it('cannot suspend non-approved profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'pending' }, error: null },
      });
      const result = await suspendInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Admin: reinstateInstructor
  // ---------------------------------------------------------------
  describe('reinstateInstructor', () => {
    it('reinstates a suspended profile', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { status: 'suspended' }, error: null }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await reinstateInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          suspended_at: null,
          suspended_by: null,
          suspension_reason: null,
        }),
      );
    });

    it('cannot reinstate non-suspended profile', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'approved' }, error: null },
      });
      const result = await reinstateInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID);
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // State Machine Parity Tests
  // ---------------------------------------------------------------
  describe('state machine transitions', () => {
    it('valid transitions: draft → pending (via submit)', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: makeProfile({ status: 'draft' }), error: null },
      });
      const result = await submitInstructorApplication(sb, MOCK_USER_ID, {
        firstName: 'A', lastName: 'B', certificateNumber: '1', certificateType: 'CFI',
      });
      // Draft allows submission (update path)
      expect(result.success).toBe(true);
    });

    it('valid transitions: rejected → pending (via resubmit)', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: makeProfile({ status: 'rejected' }),
                error: null,
              }),
            }),
          }),
          update: updateMock,
        })),
      } as never;

      const result = await submitInstructorApplication(sb, MOCK_USER_ID, {
        firstName: 'A', lastName: 'B', certificateNumber: '1', certificateType: 'CFI',
      });
      expect(result.success).toBe(true);
    });

    it('invalid: approved user cannot submit again', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: makeProfile({ status: 'approved' }), error: null },
      });
      const result = await submitInstructorApplication(sb, MOCK_USER_ID, {
        firstName: 'A', lastName: 'B', certificateNumber: '1', certificateType: 'CFI',
      });
      expect(result.success).toBe(false);
    });

    it('invalid: cannot approve draft', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'draft' }, error: null },
      });
      expect((await approveInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID)).success).toBe(false);
    });

    it('invalid: cannot reject approved', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'approved' }, error: null },
      });
      expect((await rejectInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID)).success).toBe(false);
    });

    it('invalid: cannot suspend pending', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'pending' }, error: null },
      });
      expect((await suspendInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID)).success).toBe(false);
    });

    it('invalid: cannot reinstate approved (already active)', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'approved' }, error: null },
      });
      expect((await reinstateInstructor(sb, MOCK_PROFILE_ID, MOCK_ADMIN_ID)).success).toBe(false);
    });
  });
});
