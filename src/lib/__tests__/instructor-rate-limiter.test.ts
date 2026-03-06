import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

// --- Supabase mock helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: unknown; count?: number | null };

function mockChain(result: MockResult) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  // Allow the chain itself to resolve for non-.single() terminations
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
 * calls to the same table. `tableSequences` maps table name -> array of results.
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
  checkInstructorRateLimit,
  logInviteEvent,
  DEFAULTS,
} from '../instructor-rate-limiter';

// --- Constants ---

const INSTRUCTOR_ID = 'instructor-001';

// ================================================================
// TESTS
// ================================================================

describe('instructor-rate-limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Group 1: DEFAULTS
  // ---------------------------------------------------------------
  describe('DEFAULTS', () => {
    it('default email invite limit is 20', () => {
      expect(DEFAULTS.EMAIL_INVITE_LIMIT).toBe(20);
    });

    it('default token creation limit is 50', () => {
      expect(DEFAULTS.TOKEN_CREATION_LIMIT).toBe(50);
    });

    it('rate limit window is 24 hours', () => {
      expect(DEFAULTS.RATE_LIMIT_WINDOW_HOURS).toBe(24);
    });
  });

  // ---------------------------------------------------------------
  // Group 2: checkInstructorRateLimit
  // ---------------------------------------------------------------
  describe('checkInstructorRateLimit', () => {
    it('returns allowed=true when count is under the default email limit', async () => {
      // system_config returns nothing (use defaults), invite_events returns count=5
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 5 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(20);
      expect(result.windowHours).toBe(24);
    });

    it('returns allowed=false when count equals the email limit', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 20 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(20);
      expect(result.limit).toBe(20);
    });

    it('returns allowed=false when count exceeds the email limit', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 25 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(25);
    });

    it('uses default token_created limit of 50', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 49 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'token_created');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(50);
    });

    it('reads custom email_invite_limit from system_config', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          {
            data: { value: { email_invite_limit: 10 } },
            error: null,
            count: null,
          },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 9 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('reads custom token_creation_limit from system_config', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          {
            data: { value: { token_creation_limit: 30 } },
            error: null,
            count: null,
          },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 30 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'token_created');
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(30);
    });

    it('overrideLimit parameter takes precedence over system_config', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          {
            data: { value: { email_invite_limit: 100 } },
            error: null,
            count: null,
          },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 3 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent', 5);
      expect(result.limit).toBe(5);
      expect(result.allowed).toBe(true);
    });

    it('overrideLimit blocks when count meets override', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 2 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent', 2);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(2);
      expect(result.current).toBe(2);
    });

    it('falls back to default when system_config throws', async () => {
      // system_config throws, should fall through to default
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'connection error' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 0 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.limit).toBe(20);
      expect(result.allowed).toBe(true);
    });

    it('treats null count as 0', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: null },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.current).toBe(0);
      expect(result.allowed).toBe(true);
    });

    it('windowHours is always 24', async () => {
      const sb = createSequenceMockSupabase({
        system_config: [
          { data: null, error: { message: 'not found' }, count: null },
        ],
        instructor_invite_events: [
          { data: null, error: null, count: 0 },
        ],
      });

      const result = await checkInstructorRateLimit(sb, INSTRUCTOR_ID, 'email_sent');
      expect(result.windowHours).toBe(24);
    });
  });

  // ---------------------------------------------------------------
  // Group 3: logInviteEvent
  // ---------------------------------------------------------------
  describe('logInviteEvent', () => {
    it('calls insert with correct payload for email_sent', async () => {
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const sb = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as never;

      await logInviteEvent(sb, INSTRUCTOR_ID, 'email_sent', { target_email: 'test@example.com' });

      expect((sb as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('instructor_invite_events');
      expect(insertFn).toHaveBeenCalledWith({
        instructor_user_id: INSTRUCTOR_ID,
        event_type: 'email_sent',
        metadata: { target_email: 'test@example.com' },
      });
    });

    it('calls insert with correct payload for token_created', async () => {
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const sb = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as never;

      await logInviteEvent(sb, INSTRUCTOR_ID, 'token_created', { invite_id: 'abc' });

      expect(insertFn).toHaveBeenCalledWith({
        instructor_user_id: INSTRUCTOR_ID,
        event_type: 'token_created',
        metadata: { invite_id: 'abc' },
      });
    });

    it('defaults metadata to empty object when not provided', async () => {
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const sb = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as never;

      await logInviteEvent(sb, INSTRUCTOR_ID, 'claimed');

      expect(insertFn).toHaveBeenCalledWith({
        instructor_user_id: INSTRUCTOR_ID,
        event_type: 'claimed',
        metadata: {},
      });
    });

    it('accepts rate_limited event type', async () => {
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const sb = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as never;

      await logInviteEvent(sb, INSTRUCTOR_ID, 'rate_limited', { reason: 'too many' });

      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'rate_limited' }),
      );
    });

    it('accepts revoked event type', async () => {
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
      const sb = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as never;

      await logInviteEvent(sb, INSTRUCTOR_ID, 'revoked');

      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'revoked' }),
      );
    });
  });
});
