import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only before importing the module
vi.mock('server-only', () => ({}));

// --- Supabase mock helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: unknown; count?: number | null };

function mockChain(result: MockResult) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert',
    'eq', 'neq', 'is', 'not', 'in', 'ilike',
    'gt', 'gte', 'lt', 'lte', 'filter',
    'order', 'limit',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  // Allow the chain itself to resolve for non-.single() terminations
  Object.defineProperty(chain, 'then', {
    value: (cb: (val: MockResult) => void) =>
      Promise.resolve(cb({ ...result, count: result.count ?? null })),
    writable: true,
    configurable: true,
  });
  return chain;
}

/**
 * Creates a mock Supabase that returns different results for successive
 * calls to the same table. Each call to `from(table)` pops the next result.
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
  } as never;
}

// --- Imports (after mocks) ---

import {
  getInstructorStudentList,
  getStudentDetail,
} from '../instructor-student-summary';

// --- Constants ---

const INSTRUCTOR_ID = 'instructor-001';
const STUDENT_A = 'student-aaa';
const STUDENT_B = 'student-bbb';

const sampleExamResultV2 = {
  version: 2,
  overall_status: 'pass',
  overall_score: 0.82,
  areas: [
    { area: 'I', total_in_plan: 5, asked: 4, satisfactory: 3, partial: 1, unsatisfactory: 0, credited_by_mention: 0, score: 0.875, status: 'pass' },
    { area: 'II', total_in_plan: 3, asked: 3, satisfactory: 1, partial: 1, unsatisfactory: 1, credited_by_mention: 0, score: 0.5, status: 'fail' },
  ],
  weak_elements: [
    { element_code: 'PA.II.A.K1', area: 'II', score: 'unsatisfactory', severity: 'unsatisfactory' },
    { element_code: 'PA.II.A.K2', area: 'II', score: 'partial', severity: 'partial' },
    { element_code: 'PA.I.B.K3', area: 'I', score: null, severity: 'not_asked' },
  ],
  failed_areas: ['II'],
};

// ================================================================
// TESTS
// ================================================================

describe('instructor-student-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Group 1: getInstructorStudentList
  // ---------------------------------------------------------------
  describe('getInstructorStudentList', () => {
    it('returns empty array when no connected students', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [], error: null },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result).toEqual([]);
    });

    it('returns empty array when connections data is null', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: null, error: { message: 'db error' } },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result).toEqual([]);
    });

    it('returns student summaries with display names from user_profiles', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [{ user_id: STUDENT_A, display_name: 'Alice Pilot' }], error: null },
        ],
        exam_sessions: [
          // Count query (sessionsLast7Days)
          { data: null, error: null, count: 3 },
          // Last completed session (maybeSingle)
          { data: null, error: null },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result).toHaveLength(1);
      expect(result[0].studentUserId).toBe(STUDENT_A);
      expect(result[0].displayName).toBe('Alice Pilot');
    });

    it('returns null displayName when user_profiles has no display_name', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [{ user_id: STUDENT_A, display_name: null }], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 0 },
          { data: null, error: null },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result[0].displayName).toBeNull();
    });

    it('returns sessionsLast7Days count correctly', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 7 },
          { data: null, error: null },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result[0].sessionsLast7Days).toBe(7);
    });

    it('returns readinessScore from examResultV2.overall_score (multiplied by 100)', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 1 },
          {
            data: {
              metadata: { examResultV2: { overall_score: 0.82 } },
              created_at: '2026-03-01T00:00:00Z',
            },
            error: null,
          },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result[0].readinessScore).toBe(82);
    });

    it('returns null readinessScore when no completed sessions', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 0 },
          { data: null, error: null }, // no last session
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result[0].readinessScore).toBeNull();
    });

    it('returns null readinessScore when metadata has no examResultV2', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 1 },
          {
            data: {
              metadata: { someOtherKey: 'value' },
              created_at: '2026-03-01T00:00:00Z',
            },
            error: null,
          },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      expect(result[0].readinessScore).toBeNull();
    });

    it('returns weakElements filtered to unsatisfactory/partial only, max 5', async () => {
      const manyWeakElements = [
        { element_code: 'PA.I.A.K1', area: 'I', severity: 'unsatisfactory' },
        { element_code: 'PA.I.A.K2', area: 'I', severity: 'partial' },
        { element_code: 'PA.I.B.K1', area: 'I', severity: 'unsatisfactory' },
        { element_code: 'PA.II.A.K1', area: 'II', severity: 'partial' },
        { element_code: 'PA.II.B.K1', area: 'II', severity: 'unsatisfactory' },
        { element_code: 'PA.III.A.K1', area: 'III', severity: 'partial' },      // 6th, should be excluded (max 5)
        { element_code: 'PA.IV.A.K1', area: 'IV', severity: 'not_asked' },      // excluded by filter
      ];

      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 1 },
          {
            data: {
              metadata: {
                examResultV2: {
                  overall_score: 0.5,
                  weak_elements: manyWeakElements,
                },
              },
              created_at: '2026-03-01T00:00:00Z',
            },
            error: null,
          },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      const weak = result[0].weakElements;

      // Should have at most 5
      expect(weak).toHaveLength(5);

      // None should have severity 'not_asked'
      for (const w of weak) {
        expect(['unsatisfactory', 'partial']).toContain(w.severity);
      }

      // 6th qualifying element (PA.III.A.K1) should NOT be present
      expect(weak.find(w => w.elementCode === 'PA.III.A.K1')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // Group 2: getStudentDetail
  // ---------------------------------------------------------------
  describe('getStudentDetail', () => {
    it('returns null when connection does not exist (not connected)', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: null, error: null }, // maybeSingle returns null
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).toBeNull();
    });

    it('returns student detail with area breakdown from examResultV2', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Bob Student' }, error: null },
        ],
        exam_sessions: [
          // Recent 10 sessions
          {
            data: [{
              id: 'session-1',
              rating: 'private',
              status: 'completed',
              exchange_count: 15,
              metadata: { examResultV2: sampleExamResultV2 },
              created_at: '2026-03-01T10:00:00Z',
            }],
            error: null,
          },
          // Count query (sessionsLast7Days)
          { data: null, error: null, count: 2 },
          // Last completed session
          {
            data: {
              metadata: { examResultV2: sampleExamResultV2 },
            },
            error: null,
          },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      expect(result!.areaBreakdown).toHaveLength(2);
      expect(result!.areaBreakdown[0]).toEqual({ area: 'I', score: 88, status: 'pass' });
      expect(result!.areaBreakdown[1]).toEqual({ area: 'II', score: 50, status: 'fail' });
    });

    it('returns recentSessions with correct fields (no transcript, no email)', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Charlie' }, error: null },
        ],
        exam_sessions: [
          {
            data: [{
              id: 'session-1',
              rating: 'commercial',
              status: 'completed',
              exchange_count: 10,
              metadata: null,
              created_at: '2026-03-02T12:00:00Z',
            }],
            error: null,
          },
          { data: null, error: null, count: 1 },
          { data: null, error: null },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      expect(result!.recentSessions).toHaveLength(1);

      const session = result!.recentSessions[0];
      expect(session).toEqual({
        id: 'session-1',
        rating: 'commercial',
        status: 'completed',
        exchangeCount: 10,
        overallScore: null,
        createdAt: '2026-03-02T12:00:00Z',
      });

      // Ensure no transcript or email fields leak through
      expect(session).not.toHaveProperty('transcript');
      expect(session).not.toHaveProperty('email');
    });

    it('returns recommendedTopics from top 3 weak elements', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Dana' }, error: null },
        ],
        exam_sessions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
          {
            data: {
              metadata: { examResultV2: sampleExamResultV2 },
            },
            error: null,
          },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();

      // sampleExamResultV2 has 2 qualifying weak elements (unsatisfactory + partial)
      // 'not_asked' is filtered out
      expect(result!.recommendedTopics).toEqual([
        'PA.II.A.K1',
        'PA.II.A.K2',
      ]);
    });

    it('returns empty areaBreakdown when no examResultV2', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Eve' }, error: null },
        ],
        exam_sessions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
          { data: null, error: null }, // no completed session
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      expect(result!.areaBreakdown).toEqual([]);
    });

    it('returns overallScore in session brief (rounded to %)', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Frank' }, error: null },
        ],
        exam_sessions: [
          {
            data: [{
              id: 'session-1',
              rating: 'private',
              status: 'completed',
              exchange_count: 8,
              metadata: { examResultV2: { overall_score: 0.756 } },
              created_at: '2026-03-01T00:00:00Z',
            }],
            error: null,
          },
          { data: null, error: null, count: 1 },
          { data: null, error: null },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      // 0.756 * 100 = 75.6 → rounded = 76
      expect(result!.recentSessions[0].overallScore).toBe(76);
    });

    it('returns empty weakElements when examResultV2 has no weak_elements', async () => {
      const noWeakExamResult = {
        overall_score: 0.95,
        areas: [{ area: 'I', score: 0.95, status: 'pass' }],
        // no weak_elements key at all
      };

      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Grace' }, error: null },
        ],
        exam_sessions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
          {
            data: {
              metadata: { examResultV2: noWeakExamResult },
            },
            error: null,
          },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      expect(result!.weakElements).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // Group 3: Privacy checks
  // ---------------------------------------------------------------
  describe('Privacy checks', () => {
    it('getInstructorStudentList response never includes student email', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: [{ student_user_id: STUDENT_A }], error: null },
        ],
        user_profiles: [
          { data: [{ user_id: STUDENT_A, display_name: 'Test', email: 'secret@test.com' }], error: null },
        ],
        exam_sessions: [
          { data: null, error: null, count: 0 },
          { data: null, error: null },
        ],
      });

      const result = await getInstructorStudentList(sb, INSTRUCTOR_ID);
      const json = JSON.stringify(result);
      expect(json).not.toContain('secret@test.com');
      expect(json).not.toContain('"email"');
    });

    it('getStudentDetail response never includes raw transcript data', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Henry' }, error: null },
        ],
        exam_sessions: [
          {
            data: [{
              id: 'session-1',
              rating: 'private',
              status: 'completed',
              exchange_count: 5,
              metadata: null,
              created_at: '2026-03-01T00:00:00Z',
              // These fields should NOT leak into output
              transcript: 'This is a raw transcript that should not appear',
            }],
            error: null,
          },
          { data: null, error: null, count: 0 },
          { data: null, error: null },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      const json = JSON.stringify(result);
      expect(json).not.toContain('raw transcript');
      expect(json).not.toContain('"transcript"');
    });

    it('getStudentDetail response never includes certificate_number', async () => {
      const sb = createSequenceMockSupabase({
        student_instructor_connections: [
          { data: { id: 'conn-1', state: 'connected' }, error: null },
        ],
        user_profiles: [
          { data: { display_name: 'Iris', certificate_number: 'CERT-12345' }, error: null },
        ],
        exam_sessions: [
          { data: [], error: null },
          { data: null, error: null, count: 0 },
          { data: null, error: null },
        ],
      });

      const result = await getStudentDetail(sb, INSTRUCTOR_ID, STUDENT_A);
      expect(result).not.toBeNull();
      const json = JSON.stringify(result);
      expect(json).not.toContain('CERT-12345');
      expect(json).not.toContain('certificate_number');
    });
  });
});
