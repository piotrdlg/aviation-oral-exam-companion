import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the /try landing page (ad traffic destination).
 *
 * Covers:
 * - Minimal header (logo only, no nav links)
 * - Hero section with heading and CTA
 * - "How It Works" feature cards
 * - Comparison table
 * - Final CTA section
 * - Minimal footer with privacy/terms links
 */
export class TryPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly headerLogo: Locator;
  readonly ctaLinks: Locator;
  readonly footerPrivacyLink: Locator;
  readonly footerTermsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.headerLogo = page.locator('header').getByText('HEYDPE');
    this.ctaLinks = page.getByRole('link', { name: /start free/i });
    this.footerPrivacyLink = page.locator('footer').getByRole('link', { name: /privacy/i });
    this.footerTermsLink = page.locator('footer').getByRole('link', { name: /terms/i });
  }

  async goto() {
    await this.page.goto('/try');
  }

  async expectHeadingVisible() {
    await expect(this.heading).toBeVisible();
  }

  async expectMinimalHeader() {
    await expect(this.headerLogo).toBeVisible();
    // Header should have no navigation links — only a span with the logo text
    const headerLinks = this.page.locator('header a');
    const count = await headerLinks.count();
    expect(count).toBe(0);
  }

  async expectAllCtasPointToSignup() {
    const count = await this.ctaLinks.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const href = await this.ctaLinks.nth(i).getAttribute('href');
      expect(href).toBe('/signup');
    }
  }

  async expectFooterLinks() {
    await expect(this.footerPrivacyLink).toBeVisible();
    await expect(this.footerTermsLink).toBeVisible();
  }
}
