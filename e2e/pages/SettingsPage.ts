import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the settings page (/settings).
 *
 * Covers:
 * - Account info display (email, auth method)
 * - Voice tier management
 * - Active sessions list
 * - Usage dashboard (sessions, TTS chars, plan info)
 * - Subscription management (Stripe portal link)
 * - Feedback widget (bug report, content error)
 * - Sign out all other sessions
 */
export class SettingsPage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Account info
  readonly emailDisplay: Locator;
  readonly authMethodDisplay: Locator;

  // Voice tier
  readonly voiceTierSelect: Locator;
  readonly voiceTierCurrent: Locator;

  // Active sessions
  readonly activeSessionsSection: Locator;
  readonly sessionCards: Locator;
  readonly thisDeviceBadge: Locator;
  readonly signOutAllOtherButton: Locator;

  // Usage dashboard
  readonly usageSection: Locator;
  readonly sessionsUsage: Locator;
  readonly ttsUsage: Locator;
  readonly currentPlan: Locator;
  readonly renewalDate: Locator;
  readonly manageSubscriptionButton: Locator;
  readonly upgradeButton: Locator;

  // Feedback
  readonly feedbackSection: Locator;
  readonly bugReportButton: Locator;
  readonly contentErrorButton: Locator;
  readonly feedbackForm: Locator;
  readonly feedbackDescription: Locator;
  readonly feedbackSubmitButton: Locator;
  readonly feedbackSuccessMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('settings-page');

    // Account
    this.emailDisplay = page.getByTestId('account-email');
    this.authMethodDisplay = page.getByTestId('auth-method');

    // Voice
    this.voiceTierSelect = page.getByTestId('voice-tier-select');
    this.voiceTierCurrent = page.getByTestId('voice-tier-current');

    // Active sessions
    this.activeSessionsSection = page.getByTestId('active-sessions');
    this.sessionCards = page.locator('[data-testid="active-session-card"]');
    this.thisDeviceBadge = page.getByTestId('this-device-badge');
    this.signOutAllOtherButton = page.getByTestId('sign-out-all-others');

    // Usage
    this.usageSection = page.getByTestId('usage-section');
    this.sessionsUsage = page.getByTestId('sessions-usage');
    this.ttsUsage = page.getByTestId('tts-usage');
    this.currentPlan = page.getByTestId('current-plan');
    this.renewalDate = page.getByTestId('renewal-date');
    this.manageSubscriptionButton = page.getByTestId('manage-subscription');
    this.upgradeButton = page.getByTestId('upgrade-button');

    // Feedback
    this.feedbackSection = page.getByTestId('feedback-section');
    this.bugReportButton = page.getByTestId('bug-report-button');
    this.contentErrorButton = page.getByTestId('content-error-button');
    this.feedbackForm = page.getByTestId('feedback-form');
    this.feedbackDescription = page.getByTestId('feedback-description');
    this.feedbackSubmitButton = page.getByTestId('feedback-submit');
    this.feedbackSuccessMessage = page.getByTestId('feedback-success');
  }

  async goto() {
    await this.page.goto('/settings');
  }

  async expectEmail(email: string) {
    await expect(this.emailDisplay).toContainText(email);
  }

  async expectActiveSessionCount(count: number) {
    await expect(this.sessionCards).toHaveCount(count);
  }

  async expectThisDeviceBadgeVisible() {
    await expect(this.thisDeviceBadge).toBeVisible();
  }

  async signOutAllOtherSessions() {
    await this.signOutAllOtherButton.click();
  }

  async submitBugReport(description: string) {
    await this.bugReportButton.click();
    await expect(this.feedbackForm).toBeVisible();
    await this.feedbackDescription.fill(description);
    await this.feedbackSubmitButton.click();
  }

  async submitContentError(description: string) {
    await this.contentErrorButton.click();
    await expect(this.feedbackForm).toBeVisible();
    await this.feedbackDescription.fill(description);
    await this.feedbackSubmitButton.click();
  }

  async expectFeedbackSuccess() {
    await expect(this.feedbackSuccessMessage).toBeVisible();
  }

  async clickManageSubscription() {
    await this.manageSubscriptionButton.click();
  }

  async clickUpgrade() {
    await this.upgradeButton.click();
  }

  async expectCurrentPlan(plan: string | RegExp) {
    await expect(this.currentPlan).toContainText(plan);
  }
}
