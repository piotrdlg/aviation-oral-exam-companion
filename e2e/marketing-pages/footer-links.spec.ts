import { test, expect } from '@playwright/test';

/**
 * Footer link tests across marketing pages.
 *
 * Covers:
 * - Homepage footer: PRIVACY + TERMS links with correct hrefs
 * - /try footer: PRIVACY + TERMS links present
 * - All footer links are navigable (click and verify page loads)
 * - Cross-navigation between /privacy and /terms
 */

test.describe('Footer Links — Homepage', () => {
  test('homepage footer has PRIVACY and TERMS links with correct hrefs', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');

    const privacyLink = footer.getByRole('link', { name: /privacy/i });
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute('href', '/privacy');

    const termsLink = footer.getByRole('link', { name: /terms/i });
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveAttribute('href', '/terms');
  });
});

test.describe('Footer Links — /try Page', () => {
  test('/try footer has PRIVACY and TERMS links', async ({ page }) => {
    await page.goto('/try');
    const footer = page.locator('footer');

    const privacyLink = footer.getByRole('link', { name: /privacy/i });
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute('href', '/privacy');

    const termsLink = footer.getByRole('link', { name: /terms/i });
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveAttribute('href', '/terms');
  });
});

test.describe('Footer Links — Navigation', () => {
  test('footer privacy link navigates to /privacy page', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await footer.getByRole('link', { name: /privacy/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/privacy policy/i);
  });

  test('footer terms link navigates to /terms page', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await footer.getByRole('link', { name: /terms/i }).click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/terms of service/i);
  });
});

test.describe('Footer Links — Cross-Navigation', () => {
  test('/privacy links to /terms and page loads correctly', async ({ page }) => {
    await page.goto('/privacy');
    const termsLink = page.locator('main a[href="/terms"]');
    await expect(termsLink).toBeVisible();
    await termsLink.click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/terms of service/i);
  });

  test('/terms links to /privacy and page loads correctly', async ({ page }) => {
    await page.goto('/terms');
    const privacyLink = page.locator('main a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/privacy policy/i);
  });
});
