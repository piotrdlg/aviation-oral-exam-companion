import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the landing page (/).
 *
 * Covers:
 * - Hero section with heading and description
 * - CTA buttons (Sign In, Start Free Practice)
 * - Feature cards (ACS-Aligned, Voice-First, Adaptive)
 * - Rating support text (PPL, CPL, IR)
 * - Disclaimer text
 * - Navigation links
 */
export class LandingPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Hero
  readonly heroHeading: Locator;
  readonly heroDescription: Locator;

  // CTAs
  readonly signInButton: Locator;
  readonly startPracticeButton: Locator;
  readonly pricingLink: Locator;

  // Feature cards
  readonly featureCards: Locator;
  readonly acsAlignedCard: Locator;
  readonly voiceFirstCard: Locator;
  readonly adaptiveCard: Locator;

  // Disclaimer
  readonly disclaimer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.locator('body');

    // Hero
    this.heroHeading = page.getByRole('heading', { level: 1 });
    this.heroDescription = page.getByText(/practice for your faa checkride/i);

    // CTAs
    this.signInButton = page.getByRole('link', { name: /sign in/i });
    this.startPracticeButton = page.getByRole('link', { name: /start free practice|create account/i });
    this.pricingLink = page.getByRole('link', { name: /pricing/i });

    // Features
    this.featureCards = page.locator('.bg-gray-900.rounded-lg');
    this.acsAlignedCard = page.getByText('ACS-Aligned').locator('..');
    this.voiceFirstCard = page.getByText('Voice-First').locator('..');
    this.adaptiveCard = page.getByText('Adaptive').locator('..');

    // Disclaimer
    this.disclaimer = page.getByText(/for study purposes only/i);
  }

  async goto() {
    await this.page.goto('/');
  }

  async expectHeroVisible() {
    await expect(this.heroHeading).toBeVisible();
    await expect(this.heroDescription).toBeVisible();
  }

  async expectFeatureCardsVisible() {
    await expect(this.acsAlignedCard).toBeVisible();
    await expect(this.voiceFirstCard).toBeVisible();
    await expect(this.adaptiveCard).toBeVisible();
  }

  async expectRatingSupport() {
    await expect(this.heroDescription).toContainText(/private pilot/i);
    await expect(this.heroDescription).toContainText(/commercial pilot/i);
    await expect(this.heroDescription).toContainText(/instrument rating/i);
  }

  async expectDisclaimerVisible() {
    await expect(this.disclaimer).toBeVisible();
  }

  async clickSignIn() {
    await this.signInButton.click();
    await this.page.waitForURL('**/login');
  }

  async clickStartPractice() {
    await this.startPracticeButton.click();
  }

  async expectCtaButtonsVisible() {
    await expect(this.signInButton).toBeVisible();
    await expect(this.startPracticeButton).toBeVisible();
  }
}
