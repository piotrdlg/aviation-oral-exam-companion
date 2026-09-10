import { config } from './config';
import { supabase } from './supabase';

/** A typed error carrying the HTTP status + the server's `error`/`reason` code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit; timeoutMs?: number };

/**
 * Fetch a HeyDPE API route with the Supabase bearer token attached (the M1
 * contract — every authenticated route accepts `Authorization: Bearer <jwt>`).
 * Throws {@link ApiError} on non-2xx, surfacing the server's reason code so
 * callers can route trial/quota 403/429s to the upgrade flow.
 */
/** Hard ceiling so a stalled connection rejects instead of hanging a gate/screen forever. */
const REQUEST_TIMEOUT_MS = 20_000;

export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, signal, timeoutMs = REQUEST_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeader()),
        ...(headers as Record<string, string> | undefined),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (!res.ok) {
      let code: string | undefined;
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string; reason?: string; message?: string };
        code = body.reason ?? body.error;
        message = body.message ?? code ?? message;
      } catch { /* Keep the HTTP status for non-JSON failures. */ }
      throw new ApiError(res.status, code, message);
    }
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get('content-type') ?? '';
    return (contentType.includes('application/json') ? await res.json() : await res.text()) as T;
  } catch (e) {
    if (signal?.aborted) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The request timed out. Check your connection.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/** Raw fetch with bearer auth (for streaming SSE / non-JSON like /api/tts). */
export async function apiRequest(path: string, init: Omit<ApiInit, 'timeoutMs'> = {}): Promise<Response> {
  const { json, headers, ...rest } = init;
  return fetch(`${config.apiUrl}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeader()),
      ...(headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
}
