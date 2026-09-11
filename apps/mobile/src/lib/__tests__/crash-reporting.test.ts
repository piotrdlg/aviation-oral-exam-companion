import { scrubCrash, safeCrashMessage, scrubBreadcrumb } from '../crash-reporting';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@sentry/react-native', () => ({ init: vi.fn(), addBreadcrumb: vi.fn(), captureException: vi.fn() }));
const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('react-native', () => ({ Platform: platform }));

describe('crash privacy', () => {
  it('keeps stack locations while discarding personal and exam payloads', () => {
    const event = scrubCrash({
      type: undefined,
      message: 'Student answer: confidential',
      user: { email: 'pilot@example.com' },
      request: { headers: { Authorization: 'Bearer secret' }, data: 'exam transcript' },
      extra: { answer: 'confidential' },
      breadcrumbs: [{ message: 'spoken answer' }],
      exception: { values: [{ type: 'TypeError', value: 'pilot@example.com: confidential', stacktrace: { frames: [{ filename: 'app.js?token=secret', lineno: 42 }] } }] },
    });
    const json = JSON.stringify(event);
    expect(json).not.toMatch(/confidential|secret|pilot@|spoken/);
    expect(event.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({ filename: 'app.js', lineno: 42 });
  });
});

describe('early anonymous initialization', () => {
  it('installs handlers at module evaluation without awaiting consent', async () => {
    vi.resetModules();
    await import('../crash-reporting');
    const sentry = await import('@sentry/react-native');
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ autoInitializeNativeSdk: false, sendDefaultPii: false, enableAutoSessionTracking: false }));
  });
  it.each(['connect_timeout', 'Keychain unavailable', 'Request failed (503)'])('retains the safe diagnostic %s', (message) => {
    expect(safeCrashMessage(message)).toBe(message);
  });
  it('drops dynamic message content instead of guessing what is private', () => {
    expect(safeCrashMessage('connect_timeout: student@example.com secret answer')).toBe('Unexpected application failure');
    expect(scrubBreadcrumb({ category: 'console', message: 'private answer' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'heydpe.diagnostic', message: 'connect_timeout', data: { stage: 'stt', answer: 'private' } })).toEqual({ category: 'heydpe.diagnostic', timestamp: undefined, level: 'error', message: 'connect_timeout', data: { stage: 'stt' } });
  });
});


it('does not enable unsanitized native transport on Android before its privacy port', async () => {
  platform.OS = 'android';
  vi.resetModules();
  await import('../crash-reporting');
  const sentry = await import('@sentry/react-native');
  expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ enableNative: false, autoInitializeNativeSdk: false }));
  platform.OS = 'ios';
});
