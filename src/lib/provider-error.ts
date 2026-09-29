/** Allowlisted classifications only: never expose provider messages, keys or bodies. */
export type ProviderErrorClass =
  | 'openai_insufficient_quota'
  | 'openai_rate_limit'
  | 'openai_auth'
  | 'search_error'
  | 'timeout'
  | 'unknown';

export class RagSearchError extends Error {
  constructor() { super('FAA source search failed'); }
}

export function classifyProviderError(error: unknown): ProviderErrorClass {
  if (error instanceof RagSearchError) return 'search_error';
  if (!error || typeof error !== 'object') return 'unknown';
  const e = error as { status?: number; code?: string; type?: string; name?: string; message?: string; error?: { code?: string; type?: string } };
  const code = e.code ?? e.error?.code;
  const type = e.type ?? e.error?.type;
  if (code === 'insufficient_quota' || type === 'insufficient_quota'
    || (e.status === 429 && /no credits remaining|insufficient.quota|exceeded your current quota/i.test(e.message ?? ''))) {
    return 'openai_insufficient_quota';
  }
  if (e.status === 401 || e.status === 403 || code === 'invalid_api_key' || code === 'missing_api_key') return 'openai_auth';
  if (e.status === 429) return 'openai_rate_limit';
  if (e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'APIConnectionTimeoutError') return 'timeout';
  return 'unknown';
}
