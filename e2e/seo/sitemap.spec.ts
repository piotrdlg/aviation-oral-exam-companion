import { test, expect } from '@playwright/test';

/**
 * sitemap.xml tests.
 *
 * Covers:
 * - Status code 200
 * - Content-type is XML
 * - Contains all 6 public URLs
 * - Each URL has a <lastmod> entry
 */

const EXPECTED_URLS = [
  'https://heydpe.com',
  'https://heydpe.com/pricing',
  'https://heydpe.com/signup',
  'https://heydpe.com/login',
  'https://heydpe.com/privacy',
  'https://heydpe.com/terms',
];

test.describe('sitemap.xml', () => {
  test('returns 200 status', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
  });

  test('content-type contains xml', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('xml');
  });

  for (const url of EXPECTED_URLS) {
    test(`contains URL: ${url}`, async ({ request }) => {
      const response = await request.get('/sitemap.xml');
      const body = await response.text();
      expect(body).toContain(`<loc>${url}</loc>`);
    });
  }

  test('each URL entry has a <lastmod> element', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    const body = await response.text();

    for (const url of EXPECTED_URLS) {
      // Verify each <url> block containing the loc also has a lastmod
      const urlBlockRegex = new RegExp(
        `<url>\\s*<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>[\\s\\S]*?</url>`
      );
      const match = body.match(urlBlockRegex);
      expect(match, `Expected <url> block for ${url}`).not.toBeNull();
      expect(match![0]).toContain('<lastmod>');
    }
  });
});
