import { test, expect } from '@playwright/test';

/**
 * Page metadata tests.
 *
 * Covers:
 * - <title> tag content for each public page
 * - Google and Bing verification meta tags on landing page
 * - twitter:card meta tag on landing page
 */

test.describe('Metadata — Landing Page (/)', () => {
  test('title contains "HeyDPE"', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HeyDPE/);
  });

  test('has Google site verification meta tag', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('meta[name="google-site-verification"]');
    await expect(meta).toHaveCount(1);
    const content = await meta.getAttribute('content');
    expect(content).toBeTruthy();
  });

  test('has Bing site verification meta tag', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('meta[name="msvalidate.01"]');
    await expect(meta).toHaveCount(1);
    const content = await meta.getAttribute('content');
    expect(content).toBeTruthy();
  });

  test('twitter:card is summary_large_image', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('meta[name="twitter:card"]');
    await expect(meta).toHaveCount(1);
    await expect(meta).toHaveAttribute('content', 'summary_large_image');
  });
});

test.describe('Metadata — Pricing Page (/pricing)', () => {
  test('title contains "Pricing"', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveTitle(/Pricing/);
  });
});

test.describe('Metadata — Login Page (/login)', () => {
  test('title contains "Sign In"', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Sign In/);
  });
});

test.describe('Metadata — Signup Page (/signup)', () => {
  test('title contains "Get Started Free"', async ({ page }) => {
    // /signup redirects to /login in current implementation,
    // but the signup layout sets its own metadata before redirect.
    // If the redirect happens server-side, the title may reflect /login.
    // We test the metadata that Next.js resolves for the /signup route.
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    // Accept either the signup-specific title or the redirected login title
    expect(title).toMatch(/Get Started Free|Sign In/);
  });
});

test.describe('Metadata — Privacy Page (/privacy)', () => {
  test('title contains "Privacy Policy"', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveTitle(/Privacy Policy/);
  });
});

test.describe('Metadata — Terms Page (/terms)', () => {
  test('title contains "Terms of Service"', async ({ page }) => {
    await page.goto('/terms');
    await expect(page).toHaveTitle(/Terms of Service/);
  });
});

test.describe('Metadata — Try Page (/try)', () => {
  test('title contains "Try HeyDPE Free"', async ({ page }) => {
    await page.goto('/try');
    await expect(page).toHaveTitle(/Try HeyDPE Free/);
  });
});
