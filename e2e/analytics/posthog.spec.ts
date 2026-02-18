import { test, expect } from '@playwright/test';
import { mockPostHogEndpoints } from '../helpers/analytics-mocks';
import { clearConsentStorage } from '../helpers/storage';
import { CookieConsentBanner } from '../pages/CookieConsentBanner';

/**
 * PostHog analytics consent-gating tests.
 *
 * Covers:
 * - No PostHog requests fire without analytics consent
 * - No PostHog requests fire after "Necessary Only" consent
 * - PostHog requests fire after "Accept All" + page navigation
 *
 * Uses network interception via mockPostHogEndpoints to capture requests.
 * These tests run under the `no-auth` project (unauthenticated).
 */

test.describe('PostHog — Consent Gating', () => {
  test('no PostHog requests without analytics consent', async ({ page }) => {
    const { requests } = await mockPostHogEndpoints(page);

    // Navigate and clear any existing consent
    await page.goto('/');
    await clearConsentStorage(page);

    // Reload to ensure clean state (no consent stored)
    await page.reload();

    // Wait sufficient time for any deferred PostHog initialization
    await page.waitForTimeout(2000);

    expect(requests.length).toBe(0);
  });

  test('no PostHog requests after "Necessary Only"', async ({ page }) => {
    const { requests } = await mockPostHogEndpoints(page);

    await page.goto('/');
    await clearConsentStorage(page);
    await page.reload();

    const consent = new CookieConsentBanner(page);
    await consent.waitForBanner();
    await consent.necessaryOnly();

    // Wait for any delayed analytics initialization
    await page.waitForTimeout(2000);

    expect(requests.length).toBe(0);
  });

  test('PostHog requests occur after "Accept All" and navigation', async ({
    page,
  }) => {
    const { requests } = await mockPostHogEndpoints(page);

    await page.goto('/');
    await clearConsentStorage(page);
    await page.reload();

    const consent = new CookieConsentBanner(page);
    await consent.waitForBanner();
    await consent.acceptAll();

    // Navigate to another page to trigger a pageview capture
    await page.goto('/pricing');
    await page.waitForTimeout(2000);

    expect(requests.length).toBeGreaterThan(0);
  });
});
