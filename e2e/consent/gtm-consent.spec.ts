import { test, expect } from '@playwright/test';
import { CookieConsentBanner } from '../pages/CookieConsentBanner';
import {
  clearConsentStorage,
  setConsentStorage,
  getConsentUpdates,
} from '../helpers/storage';

/**
 * GTM consent mode integration tests.
 *
 * Verifies that user consent choices push the correct
 * `['consent', 'update', {...}]` entries to window.dataLayer,
 * which GTM reads to gate analytics/marketing tags.
 *
 * Covers:
 * - "Accept All" grants analytics_storage and ad_storage
 * - "Necessary Only" denies all optional storage
 * - Custom analytics-only grants analytics, denies ads
 * - Returning visitor with stored consent fires consent update on page load
 */

test.describe('Cookie Consent — GTM Consent Mode', () => {
  let banner: CookieConsentBanner;

  test.beforeEach(async ({ page }) => {
    banner = new CookieConsentBanner(page);
    await page.goto('/');
    await clearConsentStorage(page);
    await page.reload();
    await banner.waitForBanner();
  });

  test('"Accept All" pushes granted consent to dataLayer', async ({ page }) => {
    await banner.acceptAll();

    const updates = await getConsentUpdates(page);
    expect(updates.length).toBeGreaterThanOrEqual(1);

    const lastUpdate = updates[updates.length - 1] as unknown[];
    // Shape: ['consent', 'update', { analytics_storage: 'granted', ... }]
    expect(lastUpdate[0]).toBe('consent');
    expect(lastUpdate[1]).toBe('update');

    const consentData = lastUpdate[2] as Record<string, string>;
    expect(consentData.analytics_storage).toBe('granted');
    expect(consentData.ad_storage).toBe('granted');
    expect(consentData.ad_user_data).toBe('granted');
    expect(consentData.ad_personalization).toBe('granted');
  });

  test('"Necessary Only" pushes denied consent to dataLayer', async ({ page }) => {
    await banner.necessaryOnly();

    const updates = await getConsentUpdates(page);
    expect(updates.length).toBeGreaterThanOrEqual(1);

    const lastUpdate = updates[updates.length - 1] as unknown[];
    expect(lastUpdate[0]).toBe('consent');
    expect(lastUpdate[1]).toBe('update');

    const consentData = lastUpdate[2] as Record<string, string>;
    expect(consentData.analytics_storage).toBe('denied');
    expect(consentData.ad_storage).toBe('denied');
    expect(consentData.ad_user_data).toBe('denied');
    expect(consentData.ad_personalization).toBe('denied');
  });

  test('custom analytics-only grants analytics, denies ads', async ({ page }) => {
    await banner.openCustomize();
    await banner.toggleAnalytics();
    await banner.savePreferences();

    const updates = await getConsentUpdates(page);
    expect(updates.length).toBeGreaterThanOrEqual(1);

    const lastUpdate = updates[updates.length - 1] as unknown[];
    expect(lastUpdate[0]).toBe('consent');
    expect(lastUpdate[1]).toBe('update');

    const consentData = lastUpdate[2] as Record<string, string>;
    expect(consentData.analytics_storage).toBe('granted');
    expect(consentData.ad_storage).toBe('denied');
    expect(consentData.ad_user_data).toBe('denied');
    expect(consentData.ad_personalization).toBe('denied');
  });

  test('returning visitor with stored consent fires consent update on load', async ({ page }) => {
    // First, store consent as if user previously accepted all
    await setConsentStorage(page, { analytics: true, marketing: true });
    await page.reload();

    // Banner should not appear
    await page.waitForTimeout(1000);
    await banner.expectBannerHidden();

    // But the consent update should have been pushed to dataLayer on load
    const updates = await getConsentUpdates(page);
    expect(updates.length).toBeGreaterThanOrEqual(1);

    const lastUpdate = updates[updates.length - 1] as unknown[];
    expect(lastUpdate[0]).toBe('consent');
    expect(lastUpdate[1]).toBe('update');

    const consentData = lastUpdate[2] as Record<string, string>;
    expect(consentData.analytics_storage).toBe('granted');
    expect(consentData.ad_storage).toBe('granted');
  });
});
