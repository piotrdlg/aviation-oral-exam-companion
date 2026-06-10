import { describe, it, expect, vi } from 'vitest';

// session-enforcement imports 'server-only', which throws outside RSC
vi.mock('server-only', () => ({}));

import { buildExamPlan, recordQuestionAsked, shouldAdvanceElement, type ExamPlanV1 } from '../exam-plan';
import { enforceOneActiveExam } from '../session-enforcement';
import type { PlannerState } from '@/types/database';

/**
 * W2.1 — server-side exam advancement + one-active-exam enforcement.
 */

function makePlan(overrides?: Partial<ExamPlanV1>): ExamPlanV1 {
  const base = buildExamPlan(['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.B.K1'], 'linear', 3);
  return { ...base, ...overrides };
}

function makePlanner(current: string, attempts = 1): PlannerState {
  return {
    version: 1,
    queue: ['PA.I.A.K1', 'PA.I.A.K2', 'PA.I.B.K1'],
    cursor: 1,
    recent: [current],
    attempts: { [current]: attempts },
  };
}

describe('shouldAdvanceElement (W2.1)', () => {
  it('advances on a satisfactory answer', () => {
    expect(shouldAdvanceElement('satisfactory', makePlan(), makePlanner('PA.I.A.K1'))).toBe(true);
  });

  it('stays for a follow-up on the first non-satisfactory answer', () => {
    expect(shouldAdvanceElement('partial', makePlan(), makePlanner('PA.I.A.K1', 1))).toBe(false);
    expect(shouldAdvanceElement('unsatisfactory', makePlan(), makePlanner('PA.I.A.K1', 1))).toBe(false);
  });

  it('advances once the follow-up budget is used (attempt 2 with follow_up_max=1)', () => {
    expect(shouldAdvanceElement('partial', makePlan(), makePlanner('PA.I.A.K1', 2))).toBe(true);
    expect(shouldAdvanceElement('unsatisfactory', makePlan(), makePlanner('PA.I.A.K1', 2))).toBe(true);
  });

  it('advances when the plan budget is exhausted (next-task will close the exam)', () => {
    let plan = makePlan();
    while (plan.asked_count < plan.planned_question_count) {
      plan = recordQuestionAsked(plan, 'PA.I.A.K1');
    }
    expect(shouldAdvanceElement('partial', plan, makePlanner('PA.I.A.K1', 1))).toBe(true);
  });

  it('never advances for legacy sessions without plan or planner state', () => {
    expect(shouldAdvanceElement('satisfactory', undefined, makePlanner('PA.I.A.K1'))).toBe(false);
    expect(shouldAdvanceElement('satisfactory', makePlan(), undefined)).toBe(false);
    expect(shouldAdvanceElement('satisfactory', makePlan(), { recent: [], attempts: {} })).toBe(false);
  });
});

describe('enforceOneActiveExam (W2.1 — verify-before-write)', () => {
  type Row = { id?: string; session_token_hash: string; exam_session_id: string | null };

  function mockService(activeRows: Row[]) {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    const from = vi.fn((table: string) => {
      if (table === 'active_sessions') {
        return {
          upsert,
          update: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                const result = Promise.resolve({ data: activeRows });
                // also support the .neq() continuation used by the claim path
                return Object.assign(result, {
                  neq: vi.fn().mockResolvedValue({ data: activeRows }),
                });
              }),
            }),
          }),
        };
      }
      // exam_sessions pause path
      return { update };
    });
    return { client: { from } as never, upsert, from };
  }

  it('REJECTS respond when another device holds the active-exam claim, without writing', async () => {
    const { client, upsert } = mockService([
      { session_token_hash: 'other-device-hash', exam_session_id: 'exam-1' },
    ]);
    const result = await enforceOneActiveExam(client, 'user-1', 'exam-1', 'my-hash', 'respond');
    expect(result.rejected).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows respond and (re)asserts the claim when no other device is active', async () => {
    const { client, upsert } = mockService([
      { session_token_hash: 'my-hash', exam_session_id: 'exam-1' },
    ]);
    const result = await enforceOneActiveExam(client, 'user-1', 'exam-1', 'my-hash', 'respond');
    expect(result.rejected).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('allows respond when no claims exist at all (fresh state)', async () => {
    const { client, upsert } = mockService([]);
    const result = await enforceOneActiveExam(client, 'user-1', 'exam-1', 'my-hash', 'respond');
    expect(result.rejected).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('resume-current CLAIMS the exam (never rejected) even when another device was active', async () => {
    const { client, upsert } = mockService([
      { id: 'row-1', session_token_hash: 'other-device-hash', exam_session_id: 'exam-2' },
    ]);
    const result = await enforceOneActiveExam(client, 'user-1', 'exam-1', 'my-hash', 'resume-current');
    expect(result.rejected).toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
