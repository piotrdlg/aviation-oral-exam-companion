import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page object model for the practice/exam page (/practice).
 *
 * Covers:
 * - Session configuration (rating, class, study mode)
 * - Starting and ending an exam
 * - Sending student answers (text and voice)
 * - Examiner messages and assessments
 * - Report inaccurate answer flow
 * - Upgrade prompts and checkout success handling
 * - Kill switch error banners
 * - Onboarding wizard navigation
 * - Avatar/persona in message bubbles
 */
export class PracticePage {
  readonly page: Page;
  readonly pageContainer: Locator;

  // Session config
  readonly ratingSelect: Locator;
  readonly classSelect: Locator;
  readonly studyModeSelect: Locator;
  readonly startExamButton: Locator;

  // Chat interface
  readonly messageList: Locator;
  readonly examinerMessages: Locator;
  readonly studentMessages: Locator;
  readonly textInput: Locator;
  readonly sendButton: Locator;
  readonly endExamButton: Locator;

  // Voice controls
  readonly micButton: Locator;
  readonly ttsToggle: Locator;

  // Task info
  readonly currentTaskArea: Locator;
  readonly currentTaskName: Locator;

  // Assessment
  readonly assessmentBadges: Locator;
  readonly sourceSummary: Locator;

  // Report
  readonly reportButtons: Locator;
  readonly reportModal: Locator;
  readonly reportCommentInput: Locator;
  readonly reportSubmitButton: Locator;
  readonly reportTypeSelect: Locator;

  // Upgrade prompts
  readonly upgradeModal: Locator;
  readonly upgradeBanner: Locator;
  readonly upgradeDismissButton: Locator;

  // Checkout success
  readonly checkoutSuccessBanner: Locator;

  // Kill switch / error
  readonly errorBanner: Locator;
  readonly pausedSessionNotice: Locator;

  // Loading
  readonly examLoading: Locator;

  // Onboarding wizard
  readonly onboardingWizard: Locator;
  readonly wizardProgressDots: Locator;
  readonly wizardSkip: Locator;
  readonly wizardNameInput: Locator;
  readonly wizardStep3Next: Locator;
  readonly wizardStep3Back: Locator;
  readonly wizardStartButton: Locator;

  // Avatar/persona in message bubbles
  readonly examinerAvatarImgs: Locator;
  readonly studentAvatarImgs: Locator;
  readonly messageAvatarInitials: Locator;
  readonly messageSenderLabels: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageContainer = page.getByTestId('practice-page');

    // Session config
    this.ratingSelect = page.getByTestId('rating-select');
    this.classSelect = page.getByTestId('class-select');
    this.studyModeSelect = page.getByTestId('study-mode-select');
    this.startExamButton = page.getByTestId('start-exam-button');

    // Chat
    this.messageList = page.getByTestId('message-list');
    this.examinerMessages = page.locator('[data-testid="examiner-message"]');
    this.studentMessages = page.locator('[data-testid="student-message"]');
    this.textInput = page.getByTestId('answer-input');
    this.sendButton = page.getByTestId('send-answer-button');
    this.endExamButton = page.getByTestId('end-exam-button');

    // Voice
    this.micButton = page.getByTestId('mic-button');
    this.ttsToggle = page.getByTestId('tts-toggle');

    // Task info
    this.currentTaskArea = page.getByTestId('current-task-area');
    this.currentTaskName = page.getByTestId('current-task-name');

    // Assessment
    this.assessmentBadges = page.locator('[data-testid="assessment-badge"]');
    this.sourceSummary = page.locator('[data-testid="source-summary"]');

    // Report
    this.reportButtons = page.locator('[data-testid="report-answer-button"]');
    this.reportModal = page.getByTestId('report-modal');
    this.reportCommentInput = page.getByTestId('report-comment');
    this.reportSubmitButton = page.getByTestId('report-submit');
    this.reportTypeSelect = page.getByTestId('report-type-select');

    // Upgrade
    this.upgradeModal = page.getByTestId('upgrade-modal');
    this.upgradeBanner = page.getByTestId('upgrade-banner');
    this.upgradeDismissButton = page.getByTestId('upgrade-dismiss');

    // Checkout
    this.checkoutSuccessBanner = page.getByTestId('checkout-success-banner');

    // Errors
    this.errorBanner = page.getByTestId('error-banner');
    this.pausedSessionNotice = page.getByTestId('paused-session-notice');

    // Loading
    this.examLoading = page.getByTestId('exam-loading');

    // Onboarding wizard
    this.onboardingWizard = page.getByTestId('onboarding-wizard');
    this.wizardProgressDots = page.getByTestId('wizard-progress-dots');
    this.wizardSkip = page.getByTestId('wizard-skip');
    this.wizardNameInput = page.getByTestId('wizard-name-input');
    this.wizardStep3Next = page.getByTestId('wizard-step3-next');
    this.wizardStep3Back = page.getByTestId('wizard-step3-back');
    this.wizardStartButton = page.getByTestId('wizard-start-button');

    // Avatar/persona in message bubbles
    this.examinerAvatarImgs = page.locator('[data-testid="examiner-avatar-img"]');
    this.studentAvatarImgs = page.locator('[data-testid="student-avatar-img"]');
    this.messageAvatarInitials = page.locator('[data-testid="message-avatar-initials"]');
    this.messageSenderLabels = page.locator('[data-testid="message-sender-label"]');
  }

  async goto() {
    await this.page.goto('/practice');
  }

  async gotoWithCheckoutSuccess() {
    await this.page.goto('/practice?checkout=success');
  }

  async configureSession(options: {
    rating?: string;
    aircraftClass?: string;
    studyMode?: string;
  }) {
    if (options.rating) {
      await this.ratingSelect.selectOption(options.rating);
    }
    if (options.aircraftClass) {
      await this.classSelect.selectOption(options.aircraftClass);
    }
    if (options.studyMode) {
      await this.studyModeSelect.selectOption(options.studyMode);
    }
  }

  async startExam() {
    await this.startExamButton.click();
    await expect(this.examinerMessages.first()).toBeVisible({ timeout: 30_000 });
  }

  async sendAnswer(answer: string) {
    await this.textInput.fill(answer);
    await this.sendButton.click();
  }

  async endExam() {
    await this.endExamButton.click();
  }

  async reportAnswer(index: number, comment: string, reportType: string) {
    await this.reportButtons.nth(index).click();
    await expect(this.reportModal).toBeVisible();
    await this.reportTypeSelect.selectOption(reportType);
    await this.reportCommentInput.fill(comment);
    await this.reportSubmitButton.click();
  }

  async expectExaminerMessage(index: number) {
    await expect(this.examinerMessages.nth(index)).toBeVisible({ timeout: 30_000 });
  }

  async expectAssessmentBadge(index: number, score: string) {
    await expect(this.assessmentBadges.nth(index)).toContainText(score);
  }

  async getExaminerMessageText(index: number): Promise<string> {
    return await this.examinerMessages.nth(index).textContent() ?? '';
  }

  async expectKillSwitchError() {
    await expect(this.errorBanner).toBeVisible();
    await expect(this.errorBanner).toContainText(/temporarily unavailable|disabled/i);
  }

  async expectPausedSessionNotice() {
    await expect(this.pausedSessionNotice).toBeVisible();
    await expect(this.pausedSessionNotice).toContainText(/paused|another device/i);
  }

  async expectUpgradeModal() {
    await expect(this.upgradeModal).toBeVisible();
  }

  async expectCheckoutSuccess() {
    await expect(this.checkoutSuccessBanner).toBeVisible();
    await expect(this.checkoutSuccessBanner).toContainText(/subscription is active|welcome/i);
  }

  async navigateThroughWizardToStep3() {
    await this.page.getByTestId('wizard-step1-next').click();
    await this.page.getByTestId('wizard-step2-next').click();
    await expect(this.page.getByTestId('wizard-step-3')).toBeVisible();
  }

  async expectExaminerSenderLabel(label: string) {
    const firstExaminer = this.examinerMessages.first();
    await expect(firstExaminer.locator('[data-testid="message-sender-label"]')).toContainText(label);
  }

  async expectStudentSenderLabel(label: string) {
    const firstStudent = this.studentMessages.first();
    await expect(firstStudent.locator('[data-testid="message-sender-label"]')).toContainText(label);
  }
}
