import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

// --- Supabase mock helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: any; count?: number | null };

function mockChain(result: MockResult) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.gt = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.filter = vi.fn().mockReturnValue(chain);
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

function createMockSupabase(tables: Record<string, MockResult>) {
  return {
    from: vi.fn((table: string) => {
      const result = tables[table] || { data: null, error: null };
      return mockChain(result);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
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
  searchInstructors,
  requestConnection,
  cancelConnectionRequest,
  studentDisconnect,
  approveConnection,
  rejectConnection,
  instructorDisconnect,
  getStudentConnection,
} from '../instructor-connections';

// --- Constants ---

const STUDENT_USER_ID = 'student-001';
const INSTRUCTOR_USER_ID = 'instructor-002';
const CONNECTION_ID = 'conn-abc';

// ================================================================
// TESTS
// ================================================================

describe('instructor-connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Group 1: searchInstructors
  // ---------------------------------------------------------------
  describe('searchInstructors', () => {
    it('returns display-safe results (id, userId, displayName, certType — no certificate_number)', async () => {
      const sb = createMockSupabase({
        instructor_profiles: {
          data: [
            {
              id: 'prof-1',
              user_id: 'user-1',
              first_name: 'John',
              last_name: 'Smith',
              certificate_type: 'CFI',
              certificate_number: 'SECRET123', // should NOT appear in result
            },
          ],
          error: null,
        },
      });

      const results = await searchInstructors(sb, 'Smith');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'prof-1',
        userId: 'user-1',
        displayName: 'John Smith',
        certType: 'CFI',
      });
      // Ensure certificate_number is NOT in the result
      expect(results[0]).not.toHaveProperty('certificate_number');
      expect(results[0]).not.toHaveProperty('certificateNumber');
    });

    it('returns empty array when no matches', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: [], error: null },
      });

      const results = await searchInstructors(sb, 'NonExistent');
      expect(results).toEqual([]);
    });

    it('uses ilike for last name search', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: [], error: null },
      });

      await searchInstructors(sb, 'Smith');

      // Verify from() was called with instructor_profiles
      expect(sb.from).toHaveBeenCalledWith('instructor_profiles');

      // Get the chain and verify ilike was called with the last name
      const chain = (sb.from as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(chain.ilike).toHaveBeenCalledWith('last_name', 'Smith');
    });

    it('includes certificate number in filter when provided', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: [], error: null },
      });

      await searchInstructors(sb, 'Smith', 'CERT-456');

      const chain = (sb.from as ReturnType<typeof vi.fn>).mock.results[0].value;
      // eq should be called for status='approved' AND certificate_number
      expect(chain.eq).toHaveBeenCalledWith('certificate_number', 'CERT-456');
    });
  });

  // ---------------------------------------------------------------
  // Group 2: requestConnection
  // ---------------------------------------------------------------
  describe('requestConnection', () => {
    it('returns error for self-connection', async () => {
      const sb = createMockSupabase({});

      const result = await requestConnection(sb, 'user-x', 'user-x');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot connect to yourself');
      // Should not even call the database
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('returns error when instructor profile not found', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: null, error: null },
      });

      const result = await requestConnection(sb, STUDENT_USER_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instructor not found or not active');
    });

    it('returns error when instructor is not approved', async () => {
      const sb = createMockSupabase({
        instructor_profiles: { data: { status: 'pending' }, error: null },
      });

      const result = await requestConnection(sb, STUDENT_USER_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instructor not found or not active');
    });

    it('returns error when active connection already exists (connected state)', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: { status: 'approved' }, error: null },
        ],
        student_instructor_connections: [
          { data: { id: CONNECTION_ID, state: 'connected' }, error: null },
        ],
      });

      const result = await requestConnection(sb, STUDENT_USER_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection already exists');
    });

    it('returns error when pending connection already exists', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: { status: 'approved' }, error: null },
        ],
        student_instructor_connections: [
          { data: { id: CONNECTION_ID, state: 'pending' }, error: null },
        ],
      });

      const result = await requestConnection(sb, STUDENT_USER_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection already exists');
    });

    it('creates new connection with state=pending when no existing row', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: { status: 'approved' }, error: null },
        ],
        student_instructor_connections: [
          // First call: check existing — none found
          { data: null, error: null },
          // Second call: insert new connection
          { data: { id: 'new-conn-1' }, error: null },
        ],
      });

      const result = await requestConnection(sb, STUDENT_USER_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);
      expect(result.connectionId).toBe('new-conn-1');
    });

    it('reuses existing disconnected row by updating state to pending', async () => {
      const sb = createSequenceMockSupabase({
        instructor_profiles: [
          { data: { status: 'approved' }, error: null },
        ],
        student_instructor_connections: [
          // First call: check existing — found disconnected
          { data: { id: 'old-conn-1', state: 'disconnected' }, error: null },
          // Second call: update existing row
          { data: null, error: null },
        ],
      });

      const result = await requestConnection(sb, STUDENT_USER_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);
      expect(result.connectionId).toBe('old-conn-1');
    });
  });

  // ---------------------------------------------------------------
  // Group 3: cancelConnectionRequest
  // ---------------------------------------------------------------
  describe('cancelConnectionRequest', () => {
    it('returns error when connection not found', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: { data: null, error: null },
      });

      const result = await cancelConnectionRequest(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });

    it('returns error when student does not own the connection', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'pending', student_user_id: 'other-student' },
          error: null,
        },
      });

      const result = await cancelConnectionRequest(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when connection is not in pending state', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'connected', student_user_id: STUDENT_USER_ID },
          error: null,
        },
      });

      const result = await cancelConnectionRequest(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel connection in state: connected');
    });

    it('successfully transitions pending to disconnected', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          // First call: fetch connection
          {
            data: { id: CONNECTION_ID, state: 'pending', student_user_id: STUDENT_USER_ID },
            error: null,
          },
          // Second call: update state
          { data: null, error: null },
        ],
      });

      const result = await cancelConnectionRequest(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(true);

      // Verify update was called with correct state
      const updateChain = (sb.from as ReturnType<typeof vi.fn>).mock.results[1].value;
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'disconnected',
          disconnected_by: STUDENT_USER_ID,
          disconnect_reason: 'Student cancelled request',
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // Group 4: studentDisconnect
  // ---------------------------------------------------------------
  describe('studentDisconnect', () => {
    it('returns error when connection not found', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: { data: null, error: null },
      });

      const result = await studentDisconnect(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });

    it('returns error when student does not own the connection', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'connected', student_user_id: 'other-student' },
          error: null,
        },
      });

      const result = await studentDisconnect(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when connection is not in connected state', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'pending', student_user_id: STUDENT_USER_ID },
          error: null,
        },
      });

      const result = await studentDisconnect(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot disconnect from state: pending');
    });

    it('successfully transitions connected to disconnected', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          // First call: fetch connection
          {
            data: { id: CONNECTION_ID, state: 'connected', student_user_id: STUDENT_USER_ID },
            error: null,
          },
          // Second call: update state
          { data: null, error: null },
        ],
      });

      const result = await studentDisconnect(sb, CONNECTION_ID, STUDENT_USER_ID);
      expect(result.success).toBe(true);

      // Verify update was called with correct state
      const updateChain = (sb.from as ReturnType<typeof vi.fn>).mock.results[1].value;
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'disconnected',
          disconnected_by: STUDENT_USER_ID,
          disconnect_reason: 'Student disconnected',
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // Group 5: approveConnection
  // ---------------------------------------------------------------
  describe('approveConnection', () => {
    it('returns error when connection not found', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: { data: null, error: null },
      });

      const result = await approveConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });

    it('returns error when instructor does not own the connection', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'pending', instructor_user_id: 'other-instructor' },
          error: null,
        },
      });

      const result = await approveConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when connection is not pending', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'connected', instructor_user_id: INSTRUCTOR_USER_ID },
          error: null,
        },
      });

      const result = await approveConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot approve connection in state: connected');
    });

    it('successfully transitions pending to connected with approved_at and approved_by', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          // First call: fetch connection
          {
            data: { id: CONNECTION_ID, state: 'pending', instructor_user_id: INSTRUCTOR_USER_ID },
            error: null,
          },
          // Second call: update state
          { data: null, error: null },
        ],
      });

      const result = await approveConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);

      // Verify update was called with correct state
      const updateChain = (sb.from as ReturnType<typeof vi.fn>).mock.results[1].value;
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'connected',
          approved_by: INSTRUCTOR_USER_ID,
        }),
      );
      // Verify approved_at and connected_at are set (ISO string values)
      const updateArg = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg.approved_at).toBeDefined();
      expect(updateArg.connected_at).toBeDefined();
      expect(typeof updateArg.approved_at).toBe('string');
      expect(typeof updateArg.connected_at).toBe('string');
    });
  });

  // ---------------------------------------------------------------
  // Group 6: rejectConnection
  // ---------------------------------------------------------------
  describe('rejectConnection', () => {
    it('returns error when connection not found', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: { data: null, error: null },
      });

      const result = await rejectConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });

    it('returns error when instructor does not own the connection', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'pending', instructor_user_id: 'other-instructor' },
          error: null,
        },
      });

      const result = await rejectConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when connection is not pending', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'connected', instructor_user_id: INSTRUCTOR_USER_ID },
          error: null,
        },
      });

      const result = await rejectConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot reject connection in state: connected');
    });

    it('successfully transitions pending to rejected with rejected_at', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          // First call: fetch connection
          {
            data: { id: CONNECTION_ID, state: 'pending', instructor_user_id: INSTRUCTOR_USER_ID },
            error: null,
          },
          // Second call: update state
          { data: null, error: null },
        ],
      });

      const result = await rejectConnection(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);

      // Verify update was called with correct state
      const updateChain = (sb.from as ReturnType<typeof vi.fn>).mock.results[1].value;
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'rejected',
        }),
      );
      // Verify rejected_at is set
      const updateArg = (updateChain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateArg.rejected_at).toBeDefined();
      expect(typeof updateArg.rejected_at).toBe('string');
    });
  });

  // ---------------------------------------------------------------
  // Group 7: instructorDisconnect
  // ---------------------------------------------------------------
  describe('instructorDisconnect', () => {
    it('returns error when connection not found', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: { data: null, error: null },
      });

      const result = await instructorDisconnect(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection not found');
    });

    it('returns error when instructor does not own the connection', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'connected', instructor_user_id: 'other-instructor' },
          error: null,
        },
      });

      const result = await instructorDisconnect(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns error when connection is not connected', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: {
          data: { id: CONNECTION_ID, state: 'pending', instructor_user_id: INSTRUCTOR_USER_ID },
          error: null,
        },
      });

      const result = await instructorDisconnect(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot disconnect from state: pending');
    });

    it('successfully transitions connected to disconnected', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          // First call: fetch connection
          {
            data: { id: CONNECTION_ID, state: 'connected', instructor_user_id: INSTRUCTOR_USER_ID },
            error: null,
          },
          // Second call: update state
          { data: null, error: null },
        ],
      });

      const result = await instructorDisconnect(sb, CONNECTION_ID, INSTRUCTOR_USER_ID);
      expect(result.success).toBe(true);

      // Verify update was called with correct state
      const updateChain = (sb.from as ReturnType<typeof vi.fn>).mock.results[1].value;
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'disconnected',
          disconnected_by: INSTRUCTOR_USER_ID,
          disconnect_reason: 'Instructor disconnected',
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // Group 8: getStudentConnection
  // ---------------------------------------------------------------
  describe('getStudentConnection', () => {
    it('returns null when no active connection exists', async () => {
      const sb = createMockSupabase({
        student_instructor_connections: { data: null, error: null },
      });

      const result = await getStudentConnection(sb, STUDENT_USER_ID);
      expect(result).toBeNull();
    });

    it('returns connection info with instructor name when connected', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          {
            data: {
              id: CONNECTION_ID,
              state: 'connected',
              instructor_user_id: INSTRUCTOR_USER_ID,
              connected_at: '2026-03-01T10:00:00Z',
              requested_at: '2026-02-28T10:00:00Z',
            },
            error: null,
          },
        ],
        instructor_profiles: [
          {
            data: {
              first_name: 'Jane',
              last_name: 'Doe',
              certificate_type: 'CFII',
            },
            error: null,
          },
        ],
      });

      const result = await getStudentConnection(sb, STUDENT_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(CONNECTION_ID);
      expect(result!.state).toBe('connected');
      expect(result!.instructorName).toBe('Jane Doe');
      expect(result!.instructorCertType).toBe('CFII');
      expect(result!.connectedAt).toBe('2026-03-01T10:00:00Z');
      expect(result!.requestedAt).toBe('2026-02-28T10:00:00Z');
    });

    it('returns connection info when in pending state', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          {
            data: {
              id: CONNECTION_ID,
              state: 'pending',
              instructor_user_id: INSTRUCTOR_USER_ID,
              connected_at: null,
              requested_at: '2026-03-01T09:00:00Z',
            },
            error: null,
          },
        ],
        instructor_profiles: [
          {
            data: {
              first_name: 'Bob',
              last_name: null,
              certificate_type: null,
            },
            error: null,
          },
        ],
      });

      const result = await getStudentConnection(sb, STUDENT_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.state).toBe('pending');
      expect(result!.instructorName).toBe('Bob');
      expect(result!.instructorCertType).toBeNull();
      expect(result!.connectedAt).toBeNull();
      expect(result!.requestedAt).toBe('2026-03-01T09:00:00Z');
    });
  });
});
