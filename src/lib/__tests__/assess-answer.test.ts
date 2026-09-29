import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: h.create }; },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));
vi.mock('../rag-retrieval', () => ({
  searchChunks: vi.fn(async () => []),
  formatChunksForPrompt: vi.fn(() => ''),
  getImagesForChunks: vi.fn(async () => []),
}));
vi.mock('../posthog-server', () => ({ captureServerEvent: vi.fn() }));

import { assessAnswer, type AcsTaskRow, type ImageResult } from '../exam-engine';

const task: AcsTaskRow = {
  id: 'PA.I.A', area: 'I', task: 'Pilot Qualifications', applicable_classes: ['ASEL'],
  knowledge_elements: [
    { code: 'PA.I.A.K1', description: 'Certification' },
    { code: 'PA.I.A.K2', description: 'Currency' },
  ],
  risk_management_elements: [], skill_elements: [],
};
const assessment = {
  score: 'satisfactory', feedback: 'Correct.', misconceptions: [], follow_up_needed: false,
  primary_element: 'PA.I.A.K1', mentioned_elements: ['PA.I.A.K2'], source_summary: 'Test source.',
};
const images: ImageResult[] = [{
  image_id: 'image-1', public_url: 'https://example.com/figure.png', figure_label: null,
  caption: null, image_category: 'figure', width: 100, height: 100, description: null,
  doc_abbreviation: 'PHAK', page_number: 1, link_type: 'direct', relevance_score: 1,
}];
function response(text = JSON.stringify(assessment), stopReason = 'end_turn', outputTokens = 100) {
  return {
    content: [{ type: 'text', text }], stop_reason: stopReason,
    usage: { input_tokens: 200, output_tokens: outputTokens },
  };
}
function assess(questionImages?: ImageResult[]) {
  return assessAnswer(task, [{ role: 'examiner', text: 'What makes you current?' }],
    'My answer.', { ragContext: '', ragChunks: [] }, questionImages);
}

beforeEach(() => {
  h.create.mockReset();
  vi.stubEnv('LOAD_TEST_MOCK_LLM', '0');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('assessAnswer retry budgets and accounting', () => {
  it('succeeds on the first attempt with an 800-token budget', async () => {
    h.create.mockResolvedValueOnce(response());
    const result = await assess();
    expect(result).toMatchObject(assessment);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-4-6', max_tokens: 800 });
    expect(result.usage).toMatchObject({
      input_tokens: 200, output_tokens: 100, stop_reason: 'end_turn',
      attempts: [{ attempt: 1, max_tokens: 800, stop_reason: 'end_turn', output_tokens: 100 }],
    });
  });

  it('retries a max_tokens stop at 1,200 with text only, even if the JSON parses', async () => {
    h.create.mockResolvedValueOnce(response(JSON.stringify(assessment), 'max_tokens', 800))
      .mockResolvedValueOnce(response());
    expect((await assess(images)).score).toBe('satisfactory');
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create.mock.calls.map(([args]) => args.max_tokens)).toEqual([800, 1200]);
    expect(Array.isArray(h.create.mock.calls[0][0].messages[0].content)).toBe(true);
    expect(typeof h.create.mock.calls[1][0].messages[0].content).toBe('string');
  });

  it.each(['max_tokens', 'end_turn'])('returns ungraded after both attempts fail (%s)', async (stop) => {
    h.create.mockResolvedValueOnce(response('{', 'max_tokens', 800))
      .mockResolvedValueOnce(response(stop === 'max_tokens' ? JSON.stringify(assessment) : '{', stop, 1200));
    const result = await assess();
    expect(result).toMatchObject({
      score: 'ungraded', primary_element: null, mentioned_elements: [],
      feedback: 'This answer could not be assessed due to a technical issue.',
      usage: { input_tokens: 400, output_tokens: 2000, stop_reason: stop },
    });
    expect(result.usage?.attempts).toHaveLength(2);
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it.each(['', '   ', '{', 'null', '[]', '"not an assessment"'])('retries unusable text %j', async (text) => {
    h.create.mockResolvedValueOnce(response(text)).mockResolvedValueOnce(response());
    expect((await assess()).score).toBe('satisfactory');
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create.mock.calls[1][0].max_tokens).toBe(1200);
  });

  it('retries when the response has no text block', async () => {
    h.create.mockResolvedValueOnce({ ...response(), content: [] }).mockResolvedValueOnce(response());
    expect((await assess()).score).toBe('satisfactory');
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it('sums input, output, cache tokens and latency, retaining each attempt', async () => {
    vi.useFakeTimers();
    try {
      h.create.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(70);
        return { ...response('{', 'max_tokens', 800), usage: {
          input_tokens: 200, output_tokens: 800, cache_creation_input_tokens: 30, cache_read_input_tokens: 40,
        } };
      }).mockImplementationOnce(async () => {
        vi.advanceTimersByTime(110);
        return { ...response(), usage: {
          input_tokens: 300, output_tokens: 150, cache_creation_input_tokens: 20, cache_read_input_tokens: 60,
        } };
      });
      expect((await assess()).usage).toEqual({
        input_tokens: 500, output_tokens: 950, latency_ms: 180,
        cache_creation_input_tokens: 50, cache_read_input_tokens: 100, stop_reason: 'end_turn',
        attempts: [
          { attempt: 1, max_tokens: 800, stop_reason: 'max_tokens', output_tokens: 800, latency_ms: 70 },
          { attempt: 2, max_tokens: 1200, stop_reason: 'end_turn', output_tokens: 150, latency_ms: 110 },
        ],
      });
    } finally { vi.useRealTimers(); }
  });

  it.each([false, true])('preserves the image-download fallback budget (needs retry: %s)', async (retry) => {
    h.create.mockRejectedValueOnce(new Error('Unable to download image'))
      .mockResolvedValueOnce(retry ? response('{', 'max_tokens', 800) : response());
    if (retry) h.create.mockResolvedValueOnce(response());
    const result = await assess(images);
    expect(result.score).toBe('satisfactory');
    expect(h.create.mock.calls.map(([args]) => args.max_tokens)).toEqual(retry ? [800, 800, 1200] : [800, 800]);
    expect(Array.isArray(h.create.mock.calls[0][0].messages[0].content)).toBe(true);
    for (const [args] of h.create.mock.calls.slice(1)) expect(typeof args.messages[0].content).toBe('string');
    expect(result.usage?.attempts).toHaveLength(retry ? 2 : 1);
    expect(result.usage?.output_tokens).toBe(retry ? 900 : 100);
  });

  it('keeps score and element validation unchanged', async () => {
    h.create.mockResolvedValueOnce(response(JSON.stringify({
      ...assessment, score: 'invented', primary_element: 'PA.I.A.K99',
      mentioned_elements: ['PA.I.A.K2', 'PA.I.A.K2', 'PA.I.A.K99', 42],
    })));
    expect(await assess()).toMatchObject({ score: 'ungraded', primary_element: null, mentioned_elements: ['PA.I.A.K2'] });
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});
