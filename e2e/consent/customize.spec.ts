import { test, expect } from '@playwright/test';
import { CookieConsentBanner } from '../pages/CookieConsentBanner';
import {
  clearConsentStorage,
  getConsentStorage,
} from '../helpers/storage';

/**
 * Cookie consent customize modal tests.
 *
 * Covers:
 * - "Customize" opens modal with three cookie categories visible
 * - Strictly Necessary toggle is non-interactive (cursor-not-allowed)
 * - Analytics/Marketing toggles default to off (aria-checked="false")
 * - Toggle analytics on + save stores {analytics:true, marketing:false}
 * - Toggle both on + save stores {analytics:true, marketing:true}
 * - Cancel closes modal without saving consent
 * - Escape key closes modal
 * - Clicking backdrop overlay closes modal
 */

test.describe('Cookie Consent — Customize Modal', () => {
  let banner: CookieConsentBanner;

  test.beforeEach(async ({ page }) => {
    banner = new CookieConsentBanner(page);
    await page.goto('/');
    await clearConsentStorage(page);
    await page.reload();
    await banner.waitForBanner();
  });

  test('"Customize" opens modal with three cookie categories', async ({ page }) => {
    await banner.openCustomize();
    await banner.expectModalVisible();

    // All three category headings are visible
    await expect(page.getByText('Strictly Necessary')).toBeVisible();
    await expect(page.getByText('Analytics')).toBeVisible();
    await expect(page.getByText('Marketing')).toBeVisible();
  });

  test('Strictly Necessary toggle is non-interactive', async ({ page }) => {
    await banner.openCustomize();

    const necessaryToggle = page.locator('[aria-label="Strictly necessary cookies — always enabled"]');
    await expect(necessaryToggle).toBeVisible();
    await expect(necessaryToggle).toHaveClass(/cursor-not-allowed/);
  });

  test('Analytics and Marketing toggles default to off', async () => {
    await banner.openCustomize();

    await expect(banner.analyticsToggle).toHaveAttribute('aria-checked', 'false');
    await expect(banner.marketingToggle).toHaveAttribute('aria-checked', 'false');
  });

  test('toggle analytics on and save stores analytics-only consent', async ({ page }) => {
    await banner.openCustomize();
    await banner.toggleAnalytics();

    await expect(banner.analyticsToggle).toHaveAttribute('aria-checked', 'true');
    await expect(banner.marketingToggle).toHaveAttribute('aria-checked', 'false');

    await banner.savePreferences();
    await banner.expectModalHidden();
    await banner.expectBannerHidden();

    const stored = await getConsentStorage(page);
    expect(stored).not.toBeNull();
    expect(stored!.analytics).toBe(true);
    expect(stored!.marketing).toBe(false);
  });

  test('toggle both on and save stores full consent', async ({ page }) => {
    await banner.openCustomize();
    await banner.toggleAnalytics();
    await banner.toggleMarketing();

    await expect(banner.analyticsToggle).toHaveAttribute('aria-checked', 'true');
    await expect(banner.marketingToggle).toHaveAttribute('aria-checked', 'true');

    await banner.savePreferences();
    await banner.expectModalHidden();
    await banner.expectBannerHidden();

    const stored = await getConsentStorage(page);
    expect(stored).not.toBeNull();
    expect(stored!.analytics).toBe(true);
    expect(stored!.marketing).toBe(true);
  });

  test('Cancel closes modal without saving consent', async ({ page }) => {
    await banner.openCustomize();
    await banner.expectModalVisible();

    await banner.closeCustomize();
    await banner.expectModalHidden();

    // Banner should reappear since modal was cancelled
    await banner.expectBannerVisible();

    // No consent was saved
    const stored = await getConsentStorage(page);
    expect(stored).toBeNull();
  });

  test('Escape key closes modal', async ({ page }) => {
    await banner.openCustomize();
    await banner.expectModalVisible();

    await page.keyboard.press('Escape');
    await banner.expectModalHidden();

    // Banner should reappear
    await banner.expectBannerVisible();
  });

  test('clicking backdrop overlay closes modal', async ({ page }) => {
    await banner.openCustomize();
    await banner.expectModalVisible();

    // Click the backdrop overlay (the dialog element itself, at its edge)
    // The overlay is the outer div with role="dialog"; the inner card calls stopPropagation
    await banner.modal.click({ position: { x: 0, y: 0 }, force: true });
    await banner.expectModalHidden();

    // Banner should reappear
    await banner.expectBannerVisible();
  });
});
