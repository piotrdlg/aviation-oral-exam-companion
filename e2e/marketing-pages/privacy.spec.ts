import { test, expect } from '@playwright/test';
import { PrivacyPage } from '../pages/PrivacyPage';

/**
 * Privacy Policy page tests.
 *
 * Covers:
 * - Page heading (h1: "PRIVACY POLICY")
 * - All 11 section headings present
 * - Effective date text visible
 * - Cross-link to /terms
 * - Contact email in contact section
 */

test.describe('Privacy Policy Page', () => {
  let privacyPage: PrivacyPage;

  test.beforeEach(async ({ page }) => {
    privacyPage = new PrivacyPage(page);
    await privacyPage.goto();
  });

  test('renders h1 "PRIVACY POLICY"', async () => {
    await privacyPage.expectHeadingVisible();
  });

  test('all 11 section headings are present', async () => {
    await privacyPage.expectAllSectionsPresent();
  });

  test('contains effective date text', async ({ page }) => {
    await expect(page.getByText(/effective date/i)).toBeVisible();
  });

  test('links to /terms', async ({ page }) => {
    const termsLink = page.locator('main a[href="/terms"]');
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toContainText(/terms/i);
  });

  test('contact section contains email', async ({ page }) => {
    await expect(page.getByText('pd@imagineflying.com').first()).toBeVisible();
  });
});
