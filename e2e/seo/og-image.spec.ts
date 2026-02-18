import { test, expect } from '@playwright/test';

/**
 * OpenGraph image tests.
 *
 * Covers:
 * - OG image endpoint returns 200
 * - Content-type is image/png
 * - Body size is > 1KB
 * - Landing page has og:image meta tag
 */

test.describe('OpenGraph Image', () => {
  test('returns 200 status', async ({ request }) => {
    const response = await request.get('/opengraph-image');
    expect(response.status()).toBe(200);
  });

  test('content-type is image/png', async ({ request }) => {
    const response = await request.get('/opengraph-image');
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('image/png');
  });

  test('body size is greater than 1KB', async ({ request }) => {
    const response = await request.get('/opengraph-image');
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1024);
  });

  test('landing page has og:image meta tag', async ({ page }) => {
    await page.goto('/');
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveCount(1);
    const content = await ogImage.getAttribute('content');
    expect(content).toBeTruthy();
  });
});
