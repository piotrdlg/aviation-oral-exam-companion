import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the login page (/login).
 *
 * Covers:
 * - OTP email login flow (enter email, send code, enter 6-digit OTP)
 * - OAuth provider buttons (Google, Apple, Microsoft)
 * - Error states and validation
 */
export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly sendOtpButton: Locator;
  readonly otpInputs: Locator;
  readonly googleButton: Locator;
  readonly appleButton: Locator;
  readonly microsoftButton: Locator;
  readonly errorMessage: Locator;
  readonly codeExpiryMessage: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /welcome to heydpe/i });
    this.emailInput = page.getByTestId('email-input');
    this.sendOtpButton = page.getByTestId('send-otp-button');
    this.otpInputs = page.locator('[data-testid^="otp-input-"]');
    this.googleButton = page.getByTestId('oauth-google');
    this.appleButton = page.getByTestId('oauth-apple');
    this.microsoftButton = page.getByTestId('oauth-microsoft');
    this.errorMessage = page.getByTestId('auth-error');
    this.codeExpiryMessage = page.getByText(/code expires/i);
    this.loadingSpinner = page.getByTestId('auth-loading');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async sendOtp() {
    await this.sendOtpButton.click();
  }

  async enterOtpCode(code: string) {
    const digits = code.split('');
    for (let i = 0; i < digits.length; i++) {
      await this.page.getByTestId(`otp-input-${i}`).fill(digits[i]);
    }
  }

  async loginWithOtp(email: string, code: string) {
    await this.fillEmail(email);
    await this.sendOtp();
    await expect(this.page.getByTestId('otp-input-0')).toBeVisible({ timeout: 10_000 });
    await this.enterOtpCode(code);
  }

  async clickGoogleOAuth() {
    await this.googleButton.click();
  }

  async clickAppleOAuth() {
    await this.appleButton.click();
  }

  async clickMicrosoftOAuth() {
    await this.microsoftButton.click();
  }

  async expectError(messagePattern: RegExp) {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toHaveText(messagePattern);
  }

  async expectOtpInputVisible() {
    await expect(this.page.getByTestId('otp-input-0')).toBeVisible();
    await expect(this.codeExpiryMessage).toBeVisible();
  }

  async expectRedirectToPractice() {
    await this.page.waitForURL('**/practice', { timeout: 15_000 });
  }
}
