import { test, expect } from '@playwright/test';
import { getDataLayer } from '../helpers/storage';

/**
 * GTM loading tests.
 *
 * Covers:
 * - GTM script tag present with correct container ID
 * - window.dataLayer exists and is an array
 * - dataLayer contains at least one GTM-pushed entry
 *
 * These tests run under the `no-auth` project (unauthenticated).
 */

const GTM_ID = 'GTM-WZ5DFFK6';

test.describe('GTM Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('GTM script tag or noscript iframe references the correct container ID', async ({
    page,
  }) => {
    // Check for the GTM script src or noscript iframe containing the GTM ID
    const gtmPresent = await page.evaluate((id) => {
      // Check script tags
      const scripts = Array.from(document.querySelectorAll('script'));
      const hasScript = scripts.some(
        (s) => s.src.includes(id) || s.innerHTML.includes(id)
      );

      // Check noscript iframes
      const iframes = Array.from(document.querySelectorAll('noscript iframe'));
      const hasIframe = iframes.some((iframe) =>
        (iframe as HTMLIFrameElement).src.includes(id)
      );

      return hasScript || hasIframe;
    }, GTM_ID);

    expect(gtmPresent).toBe(true);
  });

  test('window.dataLayer exists and is an array', async ({ page }) => {
    const dataLayer = await getDataLayer(page);
    expect(Array.isArray(dataLayer)).toBe(true);
  });

  test('dataLayer contains at least one entry', async ({ page }) => {
    const dataLayer = await getDataLayer(page);
    expect(dataLayer.length).toBeGreaterThanOrEqual(1);
  });
});
