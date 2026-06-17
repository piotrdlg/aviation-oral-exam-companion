import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression: generateExaminerTurn / generateExaminerTurnStreaming must hand the
 * model a conversation that ENDS WITH A USER message. The call generates the next
 * examiner (assistant) turn, and claude-sonnet-4-6 rejects an assistant prefill
 * ("This model does not support assistant message prefill. The conversation must
 * end with a user message"). next-task loads the full DB transcript — which ends
 * with the examiner's last turn — so any trailing assistant turns must be stripped
 * before the API call. (Found while wiring the mobile exam loop: respond→advance→
 * next-task 500'd because next-task's history ended with the examiner's feedback.)
 */

const h = vi.hoisted(() => ({ create: vi.fn(), createStream: vi.fn() }));

vi.mock('server-only', () => ({}));

vi.mock('../rag-retrieval', () => ({
  searchChunks: vi.fn(async () => []),
  formatChunksForPrompt: vi.fn(() => ''),
  getImagesForChunks: vi.fn(async () => []),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: h.create };
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  })),
}));

vi.mock('../posthog-server', () => ({
  captureServerEvent: vi.fn(),
  flushPostHog: vi.fn(),
}));

import { generateExaminerTurn, generateExaminerTurnStreaming, type ExamMessage } from '../exam-engine';
import type { AcsTaskRow } from '../exam-logic';

const task = {
  id: 'PA.I.A',
  area: 'I',
  task: 'Pilot Qualifications',
  rating: 'private',
  knowledge_elements: [{ code: 'PA.I.A.K1', description: 'Certification requirements' }],
  risk_management_elements: [],
  skill_elements: [],
} as unknown as AcsTaskRow;

const prefetchedRag = { ragContext: '' };

// [examiner, student, examiner] — exactly what next-task loads from the DB after
// the first respond: opening question, the student's answer, the examiner's feedback.
const historyEndingWithExaminer: ExamMessage[] = [
  { role: 'examiner', text: 'What are the recency requirements to act as PIC?' },
  { role: 'student', text: 'A flight review within 24 calendar months and a current medical.' },
  { role: 'examiner', text: "That's a solid answer. You covered the core requirements well.\n" },
];

const historyEndingWithStudent: ExamMessage[] = [
  { role: 'examiner', text: 'What are the recency requirements to act as PIC?' },
  { role: 'student', text: 'A flight review within 24 calendar months.' },
];

function lastRole(messages: { role: string }[]) {
  return messages[messages.length - 1]?.role;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({
    content: [{ type: 'text', text: 'Good. What currency do you need to carry passengers at night?' }],
    usage: { input_tokens: 100, output_tokens: 20 },
  });
});

describe('generateExaminerTurn — conversation must end with a user turn', () => {
  it('strips the trailing examiner turn so the model never gets an assistant prefill', async () => {
    await generateExaminerTurn(task, historyEndingWithExaminer, undefined, 'ASEL', prefetchedRag as never);
    const sent = h.create.mock.calls[0][0].messages as { role: string; content: string }[];
    expect(lastRole(sent)).toBe('user');
    // the trailing examiner ('assistant') feedback was dropped; opening Q + answer remain
    expect(sent.map((m) => m.role)).toEqual(['assistant', 'user']);
  });

  it('leaves a history already ending with the student answer untouched', async () => {
    await generateExaminerTurn(task, historyEndingWithStudent, undefined, 'ASEL', prefetchedRag as never);
    const sent = h.create.mock.calls[0][0].messages as { role: string; content: string }[];
    expect(lastRole(sent)).toBe('user');
    expect(sent).toHaveLength(2);
  });
});

describe('generateExaminerTurnStreaming — conversation must end with a user turn', () => {
  beforeEach(() => {
    // create() resolves to an async-iterable stream of well-formed deltas; the
    // function awaits it (capturing our messages) before returning, then drains
    // it lazily in the ReadableStream's start() — we only assert on the call.
    h.create.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Next question.' } };
        yield { type: 'message_delta', usage: { output_tokens: 5 } };
      },
    });
  });

  it('strips the trailing examiner turn before streaming', async () => {
    await generateExaminerTurnStreaming(task, historyEndingWithExaminer, undefined, 'ASEL', prefetchedRag as never);
    const sent = h.create.mock.calls[0][0].messages as { role: string; content: string }[];
    expect(lastRole(sent)).toBe('user');
    expect(sent.map((m) => m.role)).toEqual(['assistant', 'user']);
  });
});
