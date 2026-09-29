import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcsTaskRow } from '../exam-logic';

const h = vi.hoisted(() => ({ embeddings: vi.fn(), constructor: vi.fn(), rpc: vi.fn(), capture: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('openai', () => ({ default: class {
  constructor(options: unknown) { h.constructor(options); }
  embeddings = { create: h.embeddings };
} }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: vi.fn() }; } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: () => ({
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }),
  rpc: h.rpc,
}) }));
vi.mock('../sentry-capture', () => ({ captureToSentry: h.capture }));
vi.mock('../posthog-server', () => ({ captureServerEvent: vi.fn() }));

const task = { id: 'PA.I.A', task: 'Pilot Qualifications' } as AcsTaskRow;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.embeddings.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
  h.rpc.mockResolvedValue({ data: [], error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('FAA grounding containment through real retrieval', () => {
  it('successful search with zero chunks is present, and constructs OpenAI lazily', async () => {
    const { fetchRagContext } = await import('../exam-engine');
    expect(h.constructor).not.toHaveBeenCalled();
    const result = await fetchRagContext(task, []);
    expect(result).toMatchObject({ grounding: 'present', ragChunks: [], ragContext: '' });
    expect(await result.ragImages).toEqual([]);
    expect(h.constructor).toHaveBeenCalledWith(expect.objectContaining({ timeout: 2500, maxRetries: 1 }));
    expect(h.capture).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 429, code: 'insufficient_quota', message: 'secret provider body' }, 'openai_insufficient_quota'],
    [{ status: 429, message: 'You have no credits remaining' }, 'openai_insufficient_quota'],
    [{ status: 429, code: 'rate_limit_exceeded' }, 'openai_rate_limit'],
    [{ status: 401, message: 'secret-key' }, 'openai_auth'],
    [new Error('unexpected secret body'), 'unknown'],
  ])('classifies embedding failure %j as %s and captures once', async (error, errorClass) => {
    h.embeddings.mockRejectedValue(error);
    const { fetchRagContext } = await import('../exam-engine');
    const result = await fetchRagContext(task, [], undefined, 5, { sessionId: 'session-1' });
    expect(result).toMatchObject({ grounding: 'missing', groundingError: errorClass, ragChunks: [] });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledExactlyOnceWith(expect.any(Error), { route: 'rag.fetch', sessionId: 'session-1' }, {
      tags: { component: 'rag', failure: 'grounding_missing', error_class: errorClass },
      fingerprint: ['rag-grounding-missing', errorClass],
    });
    expect(JSON.stringify(h.capture.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret');
  });

  it('missing key imports safely, then returns missing grounding', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { fetchRagContext } = await import('../exam-engine');
    expect(h.constructor).not.toHaveBeenCalled();
    expect(await fetchRagContext(task, [])).toMatchObject({ grounding: 'missing', groundingError: 'openai_auth' });
    expect(h.embeddings).not.toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('RPC errors propagate as search_error (metadata filtering: %s)', async (filtered) => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'secret database detail' } });
    const { fetchRagContext } = await import('../exam-engine');
    expect(await fetchRagContext(task, [], undefined, 5, {
      systemConfig: { 'rag.metadata_filter': { enabled: filtered } },
    })).toMatchObject({ grounding: 'missing', groundingError: 'search_error' });
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it('classifies a rejected search request as search_error', async () => {
    h.rpc.mockRejectedValue(new Error('database transport failure'));
    const { fetchRagContext } = await import('../exam-engine');
    expect(await fetchRagContext(task, [])).toMatchObject({ grounding: 'missing', groundingError: 'search_error' });
    expect(h.capture).toHaveBeenCalledTimes(1);
  });
});
