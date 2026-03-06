import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

// --- Supabase mock helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: unknown };

function mockChain(result: MockResult) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.gt = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  // Allow the chain itself to resolve for non-.single() terminations (e.g. bare update/insert)
  Object.defineProperty(chain, 'then', {
    value: (cb: (val: MockResult) => void) => Promise.resolve(cb(result)),
    writable: true,
    configurable: true,
  });
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
      counters[table] = (counters[table] || 0);
      const seq = tableSequences[table] || [{ data: null, error: null }];
      const result = seq[counters[table]] ?? seq[seq.length - 1];
      counters[table]++;
      return mockChain(result);
    }),
  } as never;
}

// --- Imports (after mocks) ---

import {
  generateInviteToken,
  buildInviteUrl,
  createInviteLink,
  claimInvite,
} from '../instructor-invites';

// --- Constants ---

const INSTRUCTOR_USER_ID = 'instructor-001';
const STUDENT_USER_ID = 'student-002';
const INVITE_ID = 'invite-abc';
const INVITE_TOKEN = 'a'.repeat(48);
const CONNECTION_ID = 'conn-xyz';

// ================================================================
// TESTS
// ================================================================

describe('instructor-invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Group 1: Token Generation
  // ---------------------------------------------------------------
  describe('generateInviteToken', () => {
    it('returns a 48-character string', () => {
      const token = generateInviteToken();
      expect(token).toHaveLength(48);
    });

    it('returns only hex characters', () => {
      const token = generateInviteToken();
      expect(token).toMatch(/^[0-9a-f]{48}$/);
    });

    it('produces different tokens on successive calls', () => {
      const token1 = generateInviteToken();
      const token2 = generateInviteToken();
      expect(token1).not.toBe(token2);
    });
  });

  // ---------------------------------------------------------------
  // Group 2: URL Building
  // ---------------------------------------------------------------
  describe('buildInviteUrl', () => {
    it('uses default base URL when no baseUrl provided', () => {
      const url = buildInviteUrl('abc123');
      // Should contain /invite/abc123 path
      expect(url).toContain('/invite/abc123');
      // Should start with https://
      expect(url).toMatch(/^https?:\/\//);
    });

    it('builds correct URL with custom baseUrl', () => {
      const url = buildInviteUrl('mytoken', 'https://example.com');
      expect(url).toBe('https://example.com/invite/mytoken');
    });

    it('URL always ends with the token', () => {
      const token = 'deadbeef1234';
      const url = buildInviteUrl(token, 'https://test.app');
      expect(url.endsWith(token)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Group 3: createInviteLink (mocked DB)
  // ---------------------------------------------------------------
  describe('createInviteLink', () => {
    it('returns error when instructor profile not found', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: { message: 'not found' } },
      });

      const result = await createInviteLink(sb, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instructor profile not found');
    });

    it('returns error when instructor profile is not approved', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'pending' }, error: null },
      });

      const result = await createInviteLink(sb, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot create invites with status: pending');
    });

    it('returns error for draft status', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'draft' }, error: null },
      });

      const result = await createInviteLink(sb, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('draft');
    });

    it('successfully creates invite when instructor is approved', async () => {
      // First call: instructor_profiles (check status)
      // Second call: instructor_invites (insert)
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: { status: 'approved' }, error: null },
        ],
        instructor_invites: [
          {
            data: {
              id: INVITE_ID,
              token: INVITE_TOKEN,
              expires_at: '2026-04-01T00:00:00Z',
            },
            error: null,
          },
        ],
      });

      const result = await createInviteLink(sb, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);
      expect(result.invite).toBeDefined();
      expect(result.invite!.id).toBe(INVITE_ID);
      expect(result.invite!.token).toBe(INVITE_TOKEN);
    });

    it('returns invite_url in result on success', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: { status: 'approved' }, error: null },
        ],
        instructor_invites: [
          {
            data: {
              id: INVITE_ID,
              token: INVITE_TOKEN,
              expires_at: '2026-04-01T00:00:00Z',
            },
            error: null,
          },
        ],
      });

      const result = await createInviteLink(sb, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);
      expect(result.invite!.inviteUrl).toContain(`/invite/${INVITE_TOKEN}`);
    });
  });

  // ---------------------------------------------------------------
  // Group 4: claimInvite (mocked DB)
  // ---------------------------------------------------------------
  describe('claimInvite', () => {
    it('returns error when token not found', async () => {
      const sb = createMockSupabase({
        instructor_invites: { data: null, error: { message: 'not found' } },
      });

      const result = await claimInvite(sb, 'bad-token', STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invite not found');
    });

    it('returns error when invite is revoked', async () => {
      const sb = createMockSupabase({
        instructor_invites: {
          data: {
            id: INVITE_ID,
            instructor_user_id: INSTRUCTOR_USER_ID,
            expires_at: '2099-01-01T00:00:00Z',
            claimed_by_user_id: null,
            revoked_at: '2026-02-01T00:00:00Z',
          },
          error: null,
        },
      });

      const result = await claimInvite(sb, INVITE_TOKEN, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('This invite has been revoked');
    });

    it('returns error when invite is already claimed by another user', async () => {
      const sb = createMockSupabase({
        instructor_invites: {
          data: {
            id: INVITE_ID,
            instructor_user_id: INSTRUCTOR_USER_ID,
            expires_at: '2099-01-01T00:00:00Z',
            claimed_by_user_id: 'other-user-999',
            revoked_at: null,
          },
          error: null,
        },
      });

      const result = await claimInvite(sb, INVITE_TOKEN, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('This invite has already been claimed');
    });

    it('returns error when invite is expired', async () => {
      const sb = createMockSupabase({
        instructor_invites: {
          data: {
            id: INVITE_ID,
            instructor_user_id: INSTRUCTOR_USER_ID,
            expires_at: '2020-01-01T00:00:00Z', // well in the past
            claimed_by_user_id: null,
            revoked_at: null,
          },
          error: null,
        },
      });

      const result = await claimInvite(sb, INVITE_TOKEN, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('This invite has expired');
    });

    it('returns error when student tries to claim their own invite (self-connection)', async () => {
      const sb = createMockSupabase({
        instructor_invites: {
          data: {
            id: INVITE_ID,
            instructor_user_id: STUDENT_USER_ID, // same as claimant
            expires_at: '2099-01-01T00:00:00Z',
            claimed_by_user_id: null,
            revoked_at: null,
          },
          error: null,
        },
      });

      const result = await claimInvite(sb, INVITE_TOKEN, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('You cannot use your own invite');
    });
  });
});
