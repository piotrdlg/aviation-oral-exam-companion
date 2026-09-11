import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import trialErrors from '../../../../../docs/mobile/testing/contracts/session-trial-errors.json';
import { ApiError, apiFetch, apiRequest } from '../api';

vi.mock('../config', () => ({ config: { apiUrl: 'https://api.example' } }));
vi.mock('../supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } } }));

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mobile HTTP contract', () => {
  it('attaches bearer auth and a JSON content type to TTS', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('audio'));
    await apiRequest('/api/tts', { method: 'POST', json: { text: 'Hello' } });
    expect(fetch).toHaveBeenCalledWith('https://api.example/api/tts', expect.objectContaining({ headers: {
      'Content-Type': 'application/json', Authorization: 'Bearer test-token',
    }, body: '{"text":"Hello"}' }));
  });
  it.each(trialErrors)('reads the actual session $error response', async (body) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body, { status: 403 }));
    await expect(apiFetch('/api/session')).rejects.toMatchObject({ status: 403, code: body.error });
  });
  it('retains non-JSON HTTP failure status', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Unavailable', { status: 503 }));
    await expect(apiFetch('/api/exam')).rejects.toBeInstanceOf(ApiError);
  });
  it('propagates caller cancellation to the fetch', async () => {
    let signal: AbortSignal | null | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError'))));
    });
    const abort = new AbortController();
    const request = apiFetch('/api/stt/token', { signal: abort.signal });
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    abort.abort();
    await rejected;
    expect(signal?.aborted).toBe(true);
  });
  it('times out stalled body reads as well as response headers', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async (_url, init) => ({
      ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
      json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    } as Response));
    const request = apiFetch('/api/exam');
    const rejected = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
  });
  it('allows exam generation to finish within the server 60-second ceiling', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        setTimeout(() => resolve(Response.json({ examinerMessage: 'Question' })), 50_000);
      });
    });
    const request = apiFetch('/api/exam', { timeoutMs: 70_000 });
    await vi.advanceTimersByTimeAsync(50_000);
    await expect(request).resolves.toMatchObject({ examinerMessage: 'Question' });
    expect(requestSignal?.aborted).toBe(false);
  });
});
