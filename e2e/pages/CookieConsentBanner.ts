import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Component page object model for the cookie consent banner.
 *
 * Covers:
 * - Cookie consent banner (region) with Accept All, Necessary Only, Customize
 * - Customize modal (dialog) with analytics/marketing toggles
 * - Save Preferences / Cancel actions in modal
 *
 * Note: This is a component POM — it is composed into any page that renders
 * the CookieConsent component. The banner appears after a 500ms delay on
 * first visit (no stored consent). When Customize is clicked the banner
 * hides and the preferences modal shows.
 */
export class CookieConsentBanner {
  readonly page: Page;
  readonly banner: Locator;
  readonly acceptAllBtn: Locator;
  readonly necessaryOnlyBtn: Locator;
  readonly customizeBtn: Locator;
  readonly modal: Locator;
  readonly analyticsToggle: Locator;
  readonly marketingToggle: Locator;
  readonly savePrefsBtn: Locator;
  readonly cancelBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.banner = page.locator('[role="region"][aria-label="Cookie consent"]');
    this.acceptAllBtn = page.getByRole('button', { name: /accept all/i });
    this.necessaryOnlyBtn = page.getByRole('button', { name: /necessary only/i });
    this.customizeBtn = page.getByRole('button', { name: /^customize$/i });
    this.modal = page.locator('[role="dialog"][aria-label="Cookie preferences"]');
    this.analyticsToggle = page.getByRole('switch', { name: /toggle analytics/i });
    this.marketingToggle = page.getByRole('switch', { name: /toggle marketing/i });
    this.savePrefsBtn = page.getByRole('button', { name: /save preferences/i });
    this.cancelBtn = this.modal.getByRole('button', { name: /cancel/i });
  }

  async waitForBanner() {
    await this.banner.waitFor({ state: 'visible', timeout: 3000 });
  }

  async acceptAll() {
    await this.acceptAllBtn.click();
  }

  async necessaryOnly() {
    await this.necessaryOnlyBtn.click();
  }

  async openCustomize() {
    await this.customizeBtn.click();
    await this.modal.waitFor({ state: 'visible' });
  }

  async toggleAnalytics() {
    await this.analyticsToggle.click();
  }

  async toggleMarketing() {
    await this.marketingToggle.click();
  }

  async savePreferences() {
    await this.savePrefsBtn.click();
  }

  async closeCustomize() {
    await this.cancelBtn.click();
  }

  async expectBannerVisible() {
    await expect(this.banner).toBeVisible();
  }

  async expectBannerHidden() {
    await expect(this.banner).not.toBeVisible();
  }

  async expectModalVisible() {
    await expect(this.modal).toBeVisible();
  }

  async expectModalHidden() {
    await expect(this.modal).not.toBeVisible();
  }
}
