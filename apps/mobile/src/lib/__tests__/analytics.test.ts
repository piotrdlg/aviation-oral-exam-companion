import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { storage, crash } = vi.hoisted(() => ({ storage: new Map<string, string>(), crash: vi.fn(async () => {}) }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
} }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../config', () => ({ config: { posthogKey: 'test-key', posthogHost: 'https://telemetry.example' } }));
vi.mock('../crash-reporting', () => ({ setCrashReportingEnabled: crash }));

beforeEach(() => {
  vi.resetModules(); storage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
});

describe('telemetry consent', () => {
  it('discards events when stored consent is absent', async () => {
    const analytics = await import('../analytics');
    analytics.track('queued');
    await analytics.loadAnalyticsConsent();
    await analytics.setAnalyticsEnabled(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('replays the startup queue with prior consent', async () => {
    storage.set('heydpe_analytics_consent', 'true');
    const analytics = await import('../analytics');
    analytics.track('queued');
    await analytics.loadAnalyticsConsent();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('buffers identification until consent loads', async () => {
    storage.set('heydpe_analytics_consent', 'true');
    const analytics = await import('../analytics');
    analytics.identify('user-id', { hasDisplayName: true });
    expect(fetch).not.toHaveBeenCalled();
    await analytics.loadAnalyticsConsent();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.distinct_id).toBe('user-id');
    expect(body.event).toBe('$identify');
  });
  it('stops analytics without touching crash reporting on revocation', async () => {
    const analytics = await import('../analytics');
    await analytics.loadAnalyticsConsent();
    await analytics.setAnalyticsEnabled(true);
    await analytics.setAnalyticsEnabled(false);
    analytics.track('after-opt-out');
    expect(fetch).not.toHaveBeenCalled();
    expect(crash).not.toHaveBeenCalled();
  });
  it('returns to the anonymous id on sign-out', async () => {
    storage.set('heydpe_analytics_anon_id', 'anonymous-id');
    const analytics = await import('../analytics');
    await analytics.loadAnalyticsConsent();
    await analytics.setAnalyticsEnabled(true);
    analytics.identify('user-id');
    analytics.reset();
    analytics.track('signed-out');
    const body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]?.body as string);
    expect(body.distinct_id).toBe('anonymous-id');
  });
  it('does not restore stale consent after an opt-out during startup', async () => {
    let resolve!: (consent: string) => void;
    vi.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const analytics = await import('../analytics');
    const loading = analytics.loadAnalyticsConsent();
    await analytics.setAnalyticsEnabled(false);
    resolve('true');
    await loading;
    analytics.track('after-opt-out');
    expect(analytics.analyticsEnabled()).toBe(false);
    expect(crash).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
