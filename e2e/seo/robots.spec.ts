import { test, expect } from '@playwright/test';

/**
 * robots.txt tests.
 *
 * Covers:
 * - Status code 200
 * - User-agent directive
 * - Allow directive
 * - Disallow directives for protected paths
 * - Sitemap URL
 */

test.describe('robots.txt', () => {
  test('returns 200 status', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
  });

  test('contains User-agent: *', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('User-agent: *');
  });

  test('contains Allow: /', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Allow: /');
  });

  test('disallows /api/', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /api/');
  });

  test('disallows /admin/', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /admin/');
  });

  test('disallows /practice/', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /practice/');
  });

  test('disallows /progress/', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /progress/');
  });

  test('disallows /settings/', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /settings/');
  });

  test('disallows /auth/', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Disallow: /auth/');
  });

  test('contains sitemap URL pointing to heydpe.com', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const body = await response.text();
    expect(body).toContain('Sitemap: https://heydpe.com/sitemap.xml');
  });
});
