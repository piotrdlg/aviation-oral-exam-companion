import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * W2.2 — assessAnswer output validation: invalid scores become 'ungraded',
 * hallucinated element codes are dropped, mentions are deduped, and
 * unparseable output retries once before the explicit ungraded fallback.
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('server-only', () => ({}));

// rag-retrieval instantiates an OpenAI client at module load — mock it out
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

import { assessAnswer } from '../exam-engine';
import type { AcsTaskRow } from '../exam-logic';

const task = {
  id: 'PA.I.A',
  area: 'I',
  task: 'Pilot Qualifications',
  rating: 'private',
  knowledge_elements: [
    { code: 'PA.I.A.K1', description: 'Certification requirements' },
    { code: 'PA.I.A.K2', description: 'Currency requirements' },
  ],
  risk_management_elements: [{ code: 'PA.I.A.R1', description: 'Personal minimums' }],
  skill_elements: [],
} as unknown as AcsTaskRow;

const prefetchedRag = { ragContext: '', ragChunks: [], ragImages: [] } as never;

function llmReply(json: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => h.create.mockReset());

describe('assessAnswer validation (W2.2)', () => {
  it('passes through a valid assessment, deduping mentions', async () => {
    h.create.mockResolvedValueOnce(llmReply({
      score: 'satisfactory',
      feedback: 'good',
      misconceptions: [],
      follow_up_needed: false,
      primary_element: 'PA.I.A.K1',
      mentioned_elements: ['PA.I.A.K2', 'PA.I.A.K2', 'PA.I.A.K1', 'PA.I.A.R1'],
      source_summary: 'ok',
    }));
    const a = await assessAnswer(task, [], 'answer', prefetchedRag);
    expect(a.score).toBe('satisfactory');
    expect(a.primary_element).toBe('PA.I.A.K1');
    // deduped, primary excluded
    expect(a.mentioned_elements).toEqual(['PA.I.A.K2', 'PA.I.A.R1']);
  });

  it('marks an invalid score as ungraded (never fake partial)', async () => {
    h.create.mockResolvedValueOnce(llmReply({
      score: 'excellent', // not in the enum
      feedback: 'x',
      primary_element: 'PA.I.A.K1',
      mentioned_elements: [],
    }));
    const a = await assessAnswer(task, [], 'answer', prefetchedRag);
    expect(a.score).toBe('ungraded');
  });

  it('drops a hallucinated primary_element and invalid mentions', async () => {
    h.create.mockResolvedValueOnce(llmReply({
      score: 'partial',
      feedback: 'x',
      primary_element: 'PA.IX.Z.K9', // not a real element of this task
      mentioned_elements: ['CA.I.A.K1', 'PA.I.A.K2', 42],
    }));
    const a = await assessAnswer(task, [], 'answer', prefetchedRag);
    expect(a.score).toBe('partial');
    expect(a.primary_element).toBeNull();
    expect(a.mentioned_elements).toEqual(['PA.I.A.K2']);
  });

  it('retries once on unparseable output, succeeding on the second attempt', async () => {
    h.create
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json at all' }], usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce(llmReply({ score: 'unsatisfactory', feedback: 'y', primary_element: 'PA.I.A.K2', mentioned_elements: [] }));
    const a = await assessAnswer(task, [], 'answer', prefetchedRag);
    expect(a.score).toBe('unsatisfactory');
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it('falls back to ungraded after two unparseable attempts', async () => {
    h.create.mockResolvedValue({ content: [], usage: { input_tokens: 1, output_tokens: 1 } });
    const a = await assessAnswer(task, [], 'answer', prefetchedRag);
    expect(a.score).toBe('ungraded');
    expect(a.primary_element).toBeNull();
    expect(h.create).toHaveBeenCalledTimes(2);
  });
});
