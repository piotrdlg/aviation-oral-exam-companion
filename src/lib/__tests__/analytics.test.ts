import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackSignup, trackTrialStart, trackPurchase, pushPageData } from '../analytics';

describe('analytics (browser environment)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      dataLayer: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('trackSignup pushes sign_up event with method to dataLayer', () => {
    trackSignup('email');
    expect((window as any).dataLayer).toEqual([
      { event: 'sign_up', method: 'email' },
    ]);
  });

  test('trackTrialStart pushes trial_start event with rating', () => {
    trackTrialStart('private');
    expect((window as any).dataLayer).toEqual([
      { event: 'trial_start', rating: 'private' },
    ]);
  });

  test('trackPurchase pushes purchase event with correct ecommerce structure', () => {
    trackPurchase('txn-123', 29.99, 'pro_monthly');
    const entry = (window as any).dataLayer[0];
    expect(entry.event).toBe('purchase');
    expect(entry.ecommerce).toBeDefined();
  });

  test('trackPurchase includes transaction_id, value, currency USD, items array', () => {
    trackPurchase('txn-456', 99.0, 'pro_annual');
    const entry = (window as any).dataLayer[0];
    expect(entry.ecommerce.transaction_id).toBe('txn-456');
    expect(entry.ecommerce.value).toBe(99.0);
    expect(entry.ecommerce.currency).toBe('USD');
    expect(entry.ecommerce.items).toEqual([{ item_name: 'pro_annual' }]);
  });

  test('pushPageData pushes page_type, user_status, user_plan', () => {
    pushPageData('practice', 'logged_in', 'free');
    expect((window as any).dataLayer).toEqual([
      { page_type: 'practice', user_status: 'logged_in', user_plan: 'free' },
    ]);
  });

  test('push creates dataLayer array if it does not exist', () => {
    // dataLayer starts as undefined
    expect((window as any).dataLayer).toBeUndefined();
    trackSignup('google');
    expect(Array.isArray((window as any).dataLayer)).toBe(true);
  });

  test('multiple calls accumulate in dataLayer', () => {
    trackSignup('email');
    trackTrialStart('commercial');
    pushPageData('progress', 'logged_in', 'pro');
    expect((window as any).dataLayer).toHaveLength(3);
    expect((window as any).dataLayer[0].event).toBe('sign_up');
    expect((window as any).dataLayer[1].event).toBe('trial_start');
    expect((window as any).dataLayer[2].page_type).toBe('progress');
  });
});

describe('analytics (SSR / no window)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test('functions do not throw when window is undefined', () => {
    expect(() => trackSignup('email')).not.toThrow();
    expect(() => trackTrialStart('instrument')).not.toThrow();
    expect(() => trackPurchase('txn-789', 49.99, 'pro_monthly')).not.toThrow();
    expect(() => pushPageData('landing', 'anonymous', 'none')).not.toThrow();
  });
});
