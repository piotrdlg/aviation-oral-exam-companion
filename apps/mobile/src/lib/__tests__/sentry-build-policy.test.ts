import { describe, expect, it } from 'vitest';
import { assertSentrySettings } from '../../../scripts/sentry-build-policy.cjs';
const configured = { EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1', SENTRY_ORG: 'org', SENTRY_PROJECT: 'project', SENTRY_AUTH_TOKEN: 'synthetic-test-token' };
describe('release source-map requirements', () => {
  it.each(['preview', 'production'])('accepts configured %s without exposing credentials', (EAS_BUILD_PROFILE) => {
    expect(() => assertSentrySettings({ ...configured, EAS_BUILD_PROFILE }, true)).not.toThrow();
  });
  it.each(['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN'])('fails release builds without %s', (key) => {
    expect(() => assertSentrySettings({ ...configured, [key]: '' }, true)).toThrow(key);
  });
  it('allows local config resolution before EAS injects the secret token', () => {
    expect(() => assertSentrySettings({ ...configured, SENTRY_AUTH_TOKEN: '' })).not.toThrow();
  });
  it.each(['SENTRY_DISABLE_AUTO_UPLOAD', 'SENTRY_ALLOW_FAILURE'])('rejects the release bypass %s', (key) => {
    expect(() => assertSentrySettings({ ...configured, [key]: 'true' }, true)).toThrow('cannot bypass');
  });
  it.each(['development', 'smoke'])('allows explicitly non-distributable %s builds without upload credentials', (EAS_BUILD_PROFILE) => {
    expect(() => assertSentrySettings({ EAS_BUILD_PROFILE }, true)).not.toThrow();
  });
});
