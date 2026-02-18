import { test, expect } from '@playwright/test';
import { CookieConsentBanner } from '../pages/CookieConsentBanner';
import {
  clearConsentStorage,
  setConsentStorage,
  getConsentStorage,
} from '../helpers/storage';

/**
 * Cookie consent banner tests.
 *
 * Covers:
 * - Banner appears on fresh visit (no stored consent)
 * - Banner does NOT appear when consent is already stored
 * - "Accept All" stores analytics:true, marketing:true and hides banner
 * - "Necessary Only" stores analytics:false, marketing:false and hides banner
 * - Banner does not reappear after reload when consent is stored
 */

test.describe('Cookie Consent Banner', () => {
  let banner: CookieConsentBanner;

  test.beforeEach(async ({ page }) => {
    banner = new CookieConsentBanner(page);
    await page.goto('/');
    await clearConsentStorage(page);
    await page.reload();
  });

  test('banner appears on fresh visit after delay', async () => {
    await banner.waitForBanner();
    await banner.expectBannerVisible();
  });

  test('banner does NOT appear if consent already stored', async ({ page }) => {
    await setConsentStorage(page, { analytics: true, marketing: false });
    await page.reload();

    // Wait longer than the 500ms banner delay and confirm it never shows
    await page.waitForTimeout(1000);
    await banner.expectBannerHidden();
  });

  test('"Accept All" stores full consent and hides banner', async ({ page }) => {
    await banner.waitForBanner();
    await banner.acceptAll();

    await banner.expectBannerHidden();

    const stored = await getConsentStorage(page);
    expect(stored).not.toBeNull();
    expect(stored!.analytics).toBe(true);
    expect(stored!.marketing).toBe(true);
    expect(stored!.timestamp).toBeGreaterThan(0);
  });

  test('"Necessary Only" stores minimal consent and hides banner', async ({ page }) => {
    await banner.waitForBanner();
    await banner.necessaryOnly();

    await banner.expectBannerHidden();

    const stored = await getConsentStorage(page);
    expect(stored).not.toBeNull();
    expect(stored!.analytics).toBe(false);
    expect(stored!.marketing).toBe(false);
    expect(stored!.timestamp).toBeGreaterThan(0);
  });

  test('banner does not reappear after reload when consent is stored', async ({ page }) => {
    await banner.waitForBanner();
    await banner.acceptAll();
    await banner.expectBannerHidden();

    await page.reload();

    // Wait longer than the 500ms banner delay
    await page.waitForTimeout(1000);
    await banner.expectBannerHidden();
  });
});
