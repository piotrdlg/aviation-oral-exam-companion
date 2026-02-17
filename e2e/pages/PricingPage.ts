import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the pricing page (/pricing).
 *
 * Covers:
 * - Monthly and Annual plan cards with pricing
 * - Feature comparison lists
 * - CTA buttons (Start Free Trial)
 * - FAQ section
 * - Checkout canceled handling
 */
export class PricingPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Plan cards
  readonly monthlyCard: Locator;
  readonly annualCard: Locator;
  readonly monthlyPrice: Locator;
  readonly annualPrice: Locator;
  readonly annualSavings: Locator;

  // CTAs
  readonly monthlyCtaButton: Locator;
  readonly annualCtaButton: Locator;

  // Features
  readonly monthlyFeatures: Locator;
  readonly annualFeatures: Locator;

  // FAQ
  readonly faqSection: Locator;
  readonly faqItems: Locator;

  // Trial info
  readonly trialBadge: Locator;

  // Checkout canceled
  readonly checkoutCanceledBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('pricing-page');

    // Plans
    this.monthlyCard = page.getByTestId('plan-monthly');
    this.annualCard = page.getByTestId('plan-annual');
    this.monthlyPrice = page.getByTestId('price-monthly');
    this.annualPrice = page.getByTestId('price-annual');
    this.annualSavings = page.getByTestId('annual-savings');

    // CTAs
    this.monthlyCtaButton = page.getByTestId('cta-monthly');
    this.annualCtaButton = page.getByTestId('cta-annual');

    // Features
    this.monthlyFeatures = page.locator('[data-testid="plan-monthly"] [data-testid="feature-item"]');
    this.annualFeatures = page.locator('[data-testid="plan-annual"] [data-testid="feature-item"]');

    // FAQ
    this.faqSection = page.getByTestId('faq-section');
    this.faqItems = page.locator('[data-testid="faq-item"]');

    // Trial
    this.trialBadge = page.getByText(/7-day free trial/i);

    // Canceled
    this.checkoutCanceledBanner = page.getByTestId('checkout-canceled-banner');
  }

  async goto() {
    await this.page.goto('/pricing');
  }

  async gotoWithCanceled() {
    await this.page.goto('/pricing?checkout=canceled');
  }

  async expectPlanCardsVisible() {
    await expect(this.monthlyCard).toBeVisible();
    await expect(this.annualCard).toBeVisible();
  }

  async expectMonthlyPrice(price: string) {
    await expect(this.monthlyPrice).toContainText(price);
  }

  async expectAnnualPrice(price: string) {
    await expect(this.annualPrice).toContainText(price);
  }

  async expectTrialBadge() {
    await expect(this.trialBadge).toBeVisible();
  }

  async clickMonthlyPlan() {
    await this.monthlyCtaButton.click();
  }

  async clickAnnualPlan() {
    await this.annualCtaButton.click();
  }

  async expectFaqVisible() {
    await expect(this.faqSection).toBeVisible();
    await expect(this.faqItems.first()).toBeVisible();
  }

  async expectCheckoutCanceledBanner() {
    await expect(this.checkoutCanceledBanner).toBeVisible();
  }
}
