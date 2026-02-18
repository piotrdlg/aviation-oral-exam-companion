import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the terms of service page (/terms).
 *
 * Covers:
 * - Page heading (h1: "TERMS OF SERVICE")
 * - 13 numbered section headings (h2)
 * - Navigation links and footer
 */
export class TermsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly sectionHeadings: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.sectionHeadings = page.locator('h2');
  }

  async goto() {
    await this.page.goto('/terms');
  }

  async expectHeadingVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.heading).toContainText(/terms of service/i);
  }

  async expectAllSectionsPresent() {
    const expectedSections = [
      'Acceptance of Terms',
      'Service Description',
      'Account Terms',
      'Free Trial',
      'Refund Policy',
      'Acceptable Use',
      'Intellectual Property',
      'Disclaimer of Warranties',
      'Limitation of Liability',
      'Indemnification',
      'Governing Law',
      'Changes to Terms',
      'Contact',
    ];
    for (const section of expectedSections) {
      await expect(
        this.page.locator('h2', { hasText: new RegExp(section, 'i') }),
      ).toBeVisible();
    }
  }
}
