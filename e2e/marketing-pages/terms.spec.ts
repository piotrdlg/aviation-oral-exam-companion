import { test, expect } from '@playwright/test';
import { TermsPage } from '../pages/TermsPage';

/**
 * Terms of Service page tests.
 *
 * Covers:
 * - Page heading (h1: "TERMS OF SERVICE")
 * - All 13 section headings present
 * - Effective date text visible
 * - Cross-link to /privacy
 * - Jurisdiction text mentioning Florida / Duval County
 */

test.describe('Terms of Service Page', () => {
  let termsPage: TermsPage;

  test.beforeEach(async ({ page }) => {
    termsPage = new TermsPage(page);
    await termsPage.goto();
  });

  test('renders h1 "TERMS OF SERVICE"', async () => {
    await termsPage.expectHeadingVisible();
  });

  test('all 13 section headings are present', async () => {
    await termsPage.expectAllSectionsPresent();
  });

  test('contains effective date text', async ({ page }) => {
    await expect(page.getByText(/Effective Date:/).first()).toBeVisible();
  });

  test('links to /privacy', async ({ page }) => {
    const privacyLink = page.locator('main a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toContainText(/privacy/i);
  });

  test('mentions Florida and Duval County jurisdiction', async ({ page }) => {
    await expect(page.getByText(/State of Florida/)).toBeVisible();
    await expect(page.getByText(/Duval County/)).toBeVisible();
  });
});
