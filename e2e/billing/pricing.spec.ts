import { test, expect } from '@playwright/test';
import { PricingPage } from '../pages/PricingPage';

/**
 * Pricing page tests.
 *
 * Covers:
 * - Monthly and Annual plan cards display with correct pricing
 * - Feature comparison lists
 * - 7-day free trial badge
 * - CTA buttons for both plans
 * - FAQ section
 * - Checkout canceled banner when redirected from Stripe
 * - Unauthenticated users can view pricing
 */

test.describe('Pricing Page — Display', () => {
  let pricingPage: PricingPage;

  test.beforeEach(async ({ page }) => {
    pricingPage = new PricingPage(page);
    await pricingPage.goto();
  });

  test('displays both Monthly and Annual plan cards', async () => {
    await pricingPage.expectPlanCardsVisible();
  });

  test('Monthly plan shows $39/mo', async () => {
    await pricingPage.expectMonthlyPrice('$39');
  });

  test('Annual plan shows $299/year', async () => {
    await pricingPage.expectAnnualPrice('$299');
  });

  test('Annual plan shows savings percentage', async () => {
    await expect(pricingPage.annualSavings).toBeVisible();
    await expect(pricingPage.annualSavings).toContainText(/save|36%/i);
  });

  test('both plans show 7-day free trial badge', async () => {
    await pricingPage.expectTrialBadge();
  });

  test('Monthly plan lists key features', async () => {
    await expect(pricingPage.monthlyFeatures).not.toHaveCount(0);
    await expect(pricingPage.monthlyCard).toContainText(/all 3 ratings/i);
    await expect(pricingPage.monthlyCard).toContainText(/voice/i);
    await expect(pricingPage.monthlyCard).toContainText(/acs/i);
  });

  test('Annual plan lists key features', async () => {
    await expect(pricingPage.annualFeatures).not.toHaveCount(0);
    await expect(pricingPage.annualCard).toContainText(/everything/i);
  });

  test('displays FAQ section', async () => {
    await pricingPage.expectFaqVisible();
  });

  test('FAQ mentions supported ratings', async ({ page }) => {
    await expect(page.getByText(/ppl|cpl|ir|private|commercial|instrument/i)).toBeVisible();
  });
});

test.describe('Pricing Page — CTA Buttons', () => {
  test('Monthly CTA button is visible and enabled', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await expect(pricingPage.monthlyCtaButton).toBeVisible();
    await expect(pricingPage.monthlyCtaButton).toBeEnabled();
  });

  test('Annual CTA button is visible and enabled', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await expect(pricingPage.annualCtaButton).toBeVisible();
    await expect(pricingPage.annualCtaButton).toBeEnabled();
  });

  test('CTA button text says Start Free Trial', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await expect(pricingPage.monthlyCtaButton).toContainText(/start free trial/i);
    await expect(pricingPage.annualCtaButton).toContainText(/start free trial/i);
  });
});

test.describe('Pricing Page — Checkout Canceled', () => {
  test('shows canceled banner when redirected from Stripe', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.gotoWithCanceled();
    await pricingPage.expectCheckoutCanceledBanner();
  });

  test('normal pricing page does not show canceled banner', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await expect(pricingPage.checkoutCanceledBanner).not.toBeVisible();
  });
});

test.describe('Pricing Page — Unauthenticated Access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated users can view pricing page', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await pricingPage.expectPlanCardsVisible();
    // Should not redirect to login just for viewing pricing
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('unauthenticated user clicking CTA is redirected to login', async ({ page }) => {
    const pricingPage = new PricingPage(page);
    await pricingPage.goto();

    // Mock checkout API to return 401
    await page.route('**/api/stripe/checkout', async (route) => {
      await route.fulfill({ status: 401, body: '{"error":"Unauthorized"}' });
    });

    await pricingPage.clickMonthlyPlan();
    // Should redirect to login page
    await page.waitForURL('**/login', { timeout: 10_000 });
  });
});
