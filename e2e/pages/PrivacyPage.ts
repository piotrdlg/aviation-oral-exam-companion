import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the privacy policy page (/privacy).
 *
 * Covers:
 * - Page heading (h1: "PRIVACY POLICY")
 * - 11 numbered section headings (h2)
 * - Navigation links and footer
 */
export class PrivacyPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly sectionHeadings: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.sectionHeadings = page.locator('h2');
  }

  async goto() {
    await this.page.goto('/privacy');
  }

  async expectHeadingVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.heading).toContainText(/privacy policy/i);
  }

  async expectAllSectionsPresent() {
    const expectedSections = [
      'Introduction',
      'Information We Collect',
      'How We Use Your Information',
      'Third-Party Services',
      'Voice Data',
      'Data Retention',
      'Your Rights',
      "Children's Privacy",
      'Security',
      'Changes to This Policy',
      'Contact',
    ];
    for (const section of expectedSections) {
      await expect(
        this.page.locator('h2', { hasText: new RegExp(section, 'i') }),
      ).toBeVisible();
    }
  }
}
