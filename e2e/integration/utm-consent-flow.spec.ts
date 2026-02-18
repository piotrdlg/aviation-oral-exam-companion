import { test, expect } from '@playwright/test';
import { CookieConsentBanner } from '../pages/CookieConsentBanner';
import { mockPostHogEndpoints } from '../helpers/analytics-mocks';
import {
  clearConsentStorage,
  getDataLayerEvents,
  getConsentUpdates,
  clearUTMStorage,
} from '../helpers/storage';

/**
 * Cross-system integration tests: UTM capture + cookie consent + analytics.
 *
 * These tests verify that multiple subsystems (UTM capture, cookie consent
 * banner, GTM consent mode, PostHog analytics) work together end-to-end
 * in realistic user flows.
 *
 * Runs under the `no-auth` project (unauthenticated, empty cookies/origins).
 */

const GTM_ID = 'GTM-WZ5DFFK6';

test.describe('Integration — UTM + Consent Flow', () => {
  test('visit with UTM params + Accept All produces both dataLayer events', async ({
    page,
  }) => {
    await page.goto(
      '/?utm_source=google&utm_medium=cpc&utm_campaign=checkride'
    );
    await clearConsentStorage(page);
    await clearUTMStorage(page);
    await page.reload();

    // Re-navigate with UTM params after clearing storage
    await page.goto(
      '/?utm_source=google&utm_medium=cpc&utm_campaign=checkride'
    );

    // Wait for and interact with the consent banner
    const banner = new CookieConsentBanner(page);
    await banner.waitForBanner();
    await banner.acceptAll();

    // Verify utm_captured event is in dataLayer
    const utmEvents = await getDataLayerEvents(page, 'utm_captured');
    expect(utmEvents.length).toBeGreaterThanOrEqual(1);
    expect(utmEvents[0].utm_source).toBe('google');
    expect(utmEvents[0].utm_medium).toBe('cpc');
    expect(utmEvents[0].utm_campaign).toBe('checkride');

    // Verify consent update event is in dataLayer
    const consentUpdates = await getConsentUpdates(page);
    expect(consentUpdates.length).toBeGreaterThanOrEqual(1);

    const lastUpdate = consentUpdates[consentUpdates.length - 1] as unknown[];
    expect(lastUpdate[0]).toBe('consent');
    expect(lastUpdate[1]).toBe('update');

    const consentData = lastUpdate[2] as Record<string, string>;
    expect(consentData.analytics_storage).toBe('granted');
  });

  test('visit with UTM params + Necessary Only captures UTM but denies analytics', async ({
    page,
  }) => {
    await page.goto(
      '/?utm_source=facebook&utm_medium=social&utm_campaign=spring'
    );
    await clearConsentStorage(page);
    await clearUTMStorage(page);
    await page.reload();

    // Re-navigate with UTM params after clearing storage
    await page.goto(
      '/?utm_source=facebook&utm_medium=social&utm_campaign=spring'
    );

    // Wait for and interact with the consent banner
    const banner = new CookieConsentBanner(page);
    await banner.waitForBanner();
    await banner.necessaryOnly();

    // UTM capture does not depend on consent — event should still exist
    const utmEvents = await getDataLayerEvents(page, 'utm_captured');
    expect(utmEvents.length).toBeGreaterThanOrEqual(1);
    expect(utmEvents[0].utm_source).toBe('facebook');
    expect(utmEvents[0].utm_medium).toBe('social');
    expect(utmEvents[0].utm_campaign).toBe('spring');

    // Consent update should deny analytics
    const consentUpdates = await getConsentUpdates(page);
    expect(consentUpdates.length).toBeGreaterThanOrEqual(1);

    const lastUpdate = consentUpdates[consentUpdates.length - 1] as unknown[];
    expect(lastUpdate[0]).toBe('consent');
    expect(lastUpdate[1]).toBe('update');

    const consentData = lastUpdate[2] as Record<string, string>;
    expect(consentData.analytics_storage).toBe('denied');
  });

  test('Accept All triggers PostHog network request on navigation', async ({
    page,
  }) => {
    // Set up PostHog interception BEFORE any navigation
    const { requests } = await mockPostHogEndpoints(page);

    // Navigate and clear consent to start from a fresh state
    await page.goto('/');
    await clearConsentStorage(page);
    await page.reload();

    // Accept all cookies via the consent banner
    const banner = new CookieConsentBanner(page);
    await banner.waitForBanner();
    await banner.acceptAll();

    // Navigate to another page to trigger a PostHog pageview event
    await page.goto('/pricing');
    await page.waitForTimeout(2000);

    // PostHog only initializes if NEXT_PUBLIC_POSTHOG_KEY is set in the build environment.
    if (requests.length === 0) {
      const hasPostHog = await page.evaluate(() => typeof (window as any).posthog?.capture === 'function');
      if (!hasPostHog) {
        test.skip(true, 'PostHog not initialized — NEXT_PUBLIC_POSTHOG_KEY likely missing from env');
        return;
      }
    }
    expect(requests.length).toBeGreaterThan(0);
  });

  test('GTM script is present on the page with the correct container ID', async ({
    page,
  }) => {
    await page.goto('/');

    const gtmPresent = await page.evaluate((id) => {
      // Check script tags for GTM ID (inline or src)
      const scripts = Array.from(document.querySelectorAll('script'));
      const hasScript = scripts.some(
        (s) => s.src.includes(id) || s.innerHTML.includes(id)
      );

      // Check noscript iframes for GTM ID
      const noscripts = Array.from(document.querySelectorAll('noscript'));
      const hasNoscriptIframe = noscripts.some((ns) =>
        ns.innerHTML.includes(id)
      );

      return hasScript || hasNoscriptIframe;
    }, GTM_ID);

    expect(gtmPresent).toBe(true);
  });
});
