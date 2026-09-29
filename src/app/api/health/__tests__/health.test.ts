import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ embeddings: vi.fn(), speech: vi.fn(), db: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('openai', () => ({ default: class {
  embeddings = { create: h.embeddings };
  audio = { speech: { create: h.speech } };
} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({
  select: () => ({ limit: h.db }),
}) }) }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) vi.stubEnv(name, 'test');
  h.embeddings.mockResolvedValue({ data: [{ embedding: [0.1] }] });
  h.speech.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) });
  h.db.mockResolvedValue({ error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('health OpenAI active probes', () => {
  it('returns 200 on success; caches and coalesces both probes for ten minutes', async () => {
    const { GET } = await import('../route');
    const [first, concurrent] = await Promise.all([GET(), GET()]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    const body = await first.json();
    expect(body.checks.openai_embeddings).toEqual({ ok: true, error_class: null, checked_at: '2026-09-29T12:00:00.000Z' });
    expect(body.checks.openai_tts).toEqual(body.checks.openai_embeddings);
    expect(h.embeddings).toHaveBeenCalledExactlyOnceWith({ model: 'text-embedding-3-small', input: 'OK.' }, { signal: expect.any(AbortSignal) });
    expect(h.speech).toHaveBeenCalledExactlyOnceWith({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: 'OK.' }, { signal: expect.any(AbortSignal) });
    await vi.advanceTimersByTimeAsync(599_999);
    expect((await (await GET()).json()).checks.openai_embeddings.checked_at).toBe(body.checks.openai_embeddings.checked_at);
    expect(h.embeddings).toHaveBeenCalledTimes(1);
    expect(h.speech).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await GET()).status).toBe(200);
    expect(h.embeddings).toHaveBeenCalledTimes(2);
    expect(h.speech).toHaveBeenCalledTimes(2);
  });

  it.each(['embeddings', 'speech'] as const)('returns 503 and caches %s quota failures, then recovers', async (kind) => {
    h[kind].mockRejectedValueOnce({ status: 429, code: 'insufficient_quota', message: 'secret-key' });
    const { GET } = await import('../route');
    const first = await GET();
    expect(first.status).toBe(503);
    const body = await first.json();
    const key = kind === 'embeddings' ? 'openai_embeddings' : 'openai_tts';
    expect(body.checks[key]).toMatchObject({ ok: false, error_class: 'openai_insufficient_quota', checked_at: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('secret-key');
    expect((await GET()).status).toBe(503);
    expect(h[kind]).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_999);
    expect((await GET()).status).toBe(503);
    expect(h[kind]).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await GET()).status).toBe(200);
    expect(h[kind]).toHaveBeenCalledTimes(2);
    expect(h[kind === 'embeddings' ? 'speech' : 'embeddings']).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: 401 }, 'openai_auth'],
    [{ status: 429 }, 'openai_rate_limit'],
    [new Error('Unexpected provider failure'), 'unknown'],
  ])('returns 503 for %j and retries after sixty seconds', async (error, errorClass) => {
    h.speech.mockRejectedValueOnce(error);
    const { GET } = await import('../route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).checks.openai_tts.error_class).toBe(errorClass);
    await vi.advanceTimersByTimeAsync(59_999);
    expect((await GET()).status).toBe(503);
    expect(h.speech).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await GET()).status).toBe(200);
    expect(h.speech).toHaveBeenCalledTimes(2);
  });

  it('missing key is degraded without making provider calls', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { GET } = await import('../route');
    const response = await GET();
    expect(response.status).toBe(503);
    const { checks } = await response.json();
    expect(checks.openai_embeddings.error_class).toBe('openai_auth');
    expect(checks.openai_tts.error_class).toBe('openai_auth');
    expect(h.embeddings).not.toHaveBeenCalled();
    expect(h.speech).not.toHaveBeenCalled();
    vi.stubEnv('OPENAI_API_KEY', 'restored');
    await vi.advanceTimersByTimeAsync(59_999);
    expect((await GET()).status).toBe(503);
    expect(h.embeddings).not.toHaveBeenCalled();
    expect(h.speech).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await GET()).status).toBe(200);
    expect(h.embeddings).toHaveBeenCalledTimes(1);
    expect(h.speech).toHaveBeenCalledTimes(1);
  });

  it.each(['embeddings', 'speech', 'audio_body'] as const)('hard timeout bounds a stalled %s and caches the failure', async (kind) => {
    const stalled = () => new Promise(() => {});
    if (kind === 'audio_body') h.speech.mockResolvedValueOnce({ arrayBuffer: stalled });
    else h[kind].mockImplementationOnce(stalled);
    const { GET } = await import('../route');
    const pending = GET();
    await vi.advanceTimersByTimeAsync(8000);
    const response = await pending;
    expect(response.status).toBe(200);
    const { status, checks } = await response.json();
    expect(status).toBe('ok');
    const key = kind === 'embeddings' ? 'openai_embeddings' : 'openai_tts';
    expect(checks[key]).toEqual({ ok: false, error_class: 'timeout', checked_at: '2026-09-29T12:00:08.000Z' });
    const mock = kind === 'embeddings' ? h.embeddings : h.speech;
    expect(mock.mock.calls[0][1].signal.aborted).toBe(true);
    expect((await GET()).status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_999);
    expect((await (await GET()).json()).checks[key]).toEqual(checks[key]);
    expect(mock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const recovered = await GET();
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).checks[key]).toEqual({ ok: true, error_class: null, checked_at: '2026-09-29T12:01:08.000Z' });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each(['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('keeps missing %s unhealthy even with a probe timeout', async (key) => {
    vi.stubEnv(key, '');
    h.speech.mockRejectedValueOnce({ name: 'TimeoutError' });
    const { GET } = await import('../route');
    expect((await GET()).status).toBe(503);
  });

  it('preserves the DB failure and non-gating Deepgram key behavior', async () => {
    const { GET } = await import('../route');
    vi.stubEnv('DEEPGRAM_API_KEY', '');
    expect((await GET()).status).toBe(200);
    h.db.mockResolvedValue({ error: { message: 'offline' } });
    expect((await GET()).status).toBe(503);
  });
});
