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

type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

/**
 * Fetch a HeyDPE API route with the Supabase bearer token attached (the M1
 * contract — every authenticated route accepts `Authorization: Bearer <jwt>`).
 * Throws {@link ApiError} on non-2xx, surfacing the server's reason code so
 * callers can route trial/quota 403/429s to the upgrade flow.
 */
export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...rest,
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
      code = body.error ?? body.reason;
      message = body.message ?? code ?? message;
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  return (contentType.includes('application/json') ? await res.json() : await res.text()) as T;
}

/** Raw fetch with bearer auth (for streaming SSE / non-JSON like /api/tts). */
export async function apiRequest(path: string, init: ApiInit = {}): Promise<Response> {
  const { json, headers, ...rest } = init;
  return fetch(`${config.apiUrl}${path}`, {
    ...rest,
    headers: {
      ...(await authHeader()),
      ...(headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
}
