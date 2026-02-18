import { test, expect } from '@playwright/test';
import { getUTMStorage, clearUTMStorage } from '../helpers/storage';

/**
 * UTM parameter capture tests.
 *
 * Covers:
 * - Basic UTM capture (source, medium, campaign)
 * - UTM capture on non-root pages (/try)
 * - All 5 UTM params captured together
 * - Partial params: only present ones stored
 * - No UTM params: nothing stored, no errors
 * - UTM params survive same-origin navigation
 *
 * Uses sessionStorage key `heydpe_utm` via getUTMStorage/clearUTMStorage helpers.
 * These tests run under the `no-auth` project (unauthenticated).
 */

test.describe('UTM Capture — sessionStorage', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so we have a page context, then clear any prior UTM data
    await page.goto('/');
    await clearUTMStorage(page);
  });

  test('captures utm_source, utm_medium, utm_campaign from URL', async ({
    page,
  }) => {
    await page.goto('/?utm_source=google&utm_medium=cpc&utm_campaign=checkride');

    const utm = await getUTMStorage(page);
    expect(utm).not.toBeNull();
    expect(utm!.utm_source).toBe('google');
    expect(utm!.utm_medium).toBe('cpc');
    expect(utm!.utm_campaign).toBe('checkride');
  });

  test('captures utm_source on /try page', async ({ page }) => {
    await page.goto('/try?utm_source=facebook');

    const utm = await getUTMStorage(page);
    expect(utm).not.toBeNull();
    expect(utm!.utm_source).toBe('facebook');
  });

  test('captures all 5 UTM parameters', async ({ page }) => {
    await page.goto(
      '/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=banner_v2&utm_term=checkride+prep'
    );

    const utm = await getUTMStorage(page);
    expect(utm).not.toBeNull();
    expect(utm!.utm_source).toBe('google');
    expect(utm!.utm_medium).toBe('cpc');
    expect(utm!.utm_campaign).toBe('spring');
    expect(utm!.utm_content).toBe('banner_v2');
    expect(utm!.utm_term).toBe('checkride prep');
  });

  test('stores only the params that are present (partial)', async ({
    page,
  }) => {
    await page.goto('/?utm_source=newsletter&utm_campaign=feb2026');

    const utm = await getUTMStorage(page);
    expect(utm).not.toBeNull();
    expect(utm!.utm_source).toBe('newsletter');
    expect(utm!.utm_campaign).toBe('feb2026');
    // Absent params should not be present in the stored object
    expect(utm!.utm_medium).toBeUndefined();
    expect(utm!.utm_content).toBeUndefined();
    expect(utm!.utm_term).toBeUndefined();
  });

  test('no UTM params results in nothing stored', async ({ page }) => {
    await page.goto('/');

    const utm = await getUTMStorage(page);
    expect(utm).toBeNull();

    // Verify no console errors related to UTM
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    const utmErrors = errors.filter((e) => /utm/i.test(e));
    expect(utmErrors).toHaveLength(0);
  });

  test('UTM params survive same-origin navigation', async ({ page }) => {
    await page.goto('/?utm_source=test');

    // Wait for React hydration and UTMCapture component to run
    await page.waitForTimeout(1500);

    // Verify initial capture
    const utmBefore = await getUTMStorage(page);
    expect(utmBefore).not.toBeNull();
    expect(utmBefore!.utm_source).toBe('test');

    // Navigate to another page within the same origin
    await page.goto('/pricing');

    // sessionStorage persists within same-origin same-tab navigation
    const utmAfter = await getUTMStorage(page);
    expect(utmAfter).not.toBeNull();
    expect(utmAfter!.utm_source).toBe('test');
  });
});
