import { afterEach, expect, it, vi } from 'vitest';
import { captureToSentry } from '../sentry-capture';
const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('forwards the stable fingerprint and extra tags with existing route context', async () => {
  vi.stubEnv('SENTRY_DSN', 'test');
  const error = new Error('FAA grounding unavailable');
  const tags = { component: 'rag', failure: 'grounding_missing', error_class: 'openai_auth' };
  captureToSentry(error, { route: 'rag.fetch', sessionId: 's1' }, {
    tags, fingerprint: ['rag-grounding-missing', 'openai_auth'],
  });
  await vi.dynamicImportSettled();
  expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
    extra: { route: 'rag.fetch', sessionId: 's1' },
    tags: { route: 'rag.fetch', tier: '', ...tags },
    fingerprint: ['rag-grounding-missing', 'openai_auth'],
  });
});

it('keeps telemetry disabled when no DSN is configured', async () => {
  vi.stubEnv('SENTRY_DSN', '');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
  captureToSentry(new Error('test'), { route: 'rag.fetch' });
  await vi.dynamicImportSettled();
  expect(captureException).not.toHaveBeenCalled();
});
