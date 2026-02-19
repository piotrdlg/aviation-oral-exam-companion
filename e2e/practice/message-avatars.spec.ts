import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';
import { setupStandardMocks, makeTierResponse, makeExamStart, makeExamRespond, MOCK_VOICE_OPTIONS } from '../helpers/persona-mocks';

test.describe('Practice Page — Message Bubble Avatars and Names', () => {
  test('examiner bubble shows persona image when set', async ({ page }) => {
    await setupStandardMocks(page, {
      voiceOptions: MOCK_VOICE_OPTIONS,
      preferredVoice: 'aura-2-orion-en',
      displayName: 'Mike',
      avatarUrl: '/avatars/default-3.webp',
    });
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamRespond()) });
      }
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await expect(practice.examinerAvatarImgs.first()).toBeVisible();
  });

  test('examiner shows "DPE" fallback when no persona image', async ({ page }) => {
    await setupStandardMocks(page, {
      voiceOptions: [{ model: 'basic', label: 'Default Voice' }],
      preferredVoice: null,
    });
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await expect(practice.examinerAvatarImgs).toHaveCount(0);
    const initials = practice.examinerMessages.first().locator('[data-testid="message-avatar-initials"]');
    await expect(initials).toContainText('DPE');
  });

  test('examiner sender label shows persona name', async ({ page }) => {
    await setupStandardMocks(page, {
      voiceOptions: MOCK_VOICE_OPTIONS,
      preferredVoice: 'aura-2-orion-en',
    });
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.expectExaminerSenderLabel('Bob Mitchell');
  });

  test('examiner sender label shows "DPE EXAMINER" fallback', async ({ page }) => {
    await setupStandardMocks(page, {
      voiceOptions: [{ model: 'basic', label: 'Default Voice' }],
    });
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.expectExaminerSenderLabel('DPE EXAMINER');
  });

  test('student bubble shows avatar image when avatarUrl set', async ({ page }) => {
    await setupStandardMocks(page, {
      voiceOptions: MOCK_VOICE_OPTIONS,
      preferredVoice: 'aura-2-orion-en',
      displayName: 'Mike',
      avatarUrl: '/avatars/default-3.webp',
    });
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamRespond()) });
      }
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.sendAnswer('A private pilot certificate holder must be at least 17 years old.');
    await expect(practice.studentAvatarImgs.first()).toBeVisible();
  });

  test('student shows initials when no avatar but name set', async ({ page }) => {
    await setupStandardMocks(page, {
      displayName: 'Sarah',
      avatarUrl: null,
      voiceOptions: MOCK_VOICE_OPTIONS,
      preferredVoice: 'aura-2-orion-en',
    });
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamRespond()) });
      }
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.sendAnswer('You need a third class medical.');
    const studentInitials = practice.studentMessages.first().locator('[data-testid="message-avatar-initials"]');
    await expect(studentInitials).toContainText('S');
  });

  test('student shows "?" when no name and no avatar', async ({ page }) => {
    await setupStandardMocks(page, {
      displayName: null,
      avatarUrl: null,
      voiceOptions: MOCK_VOICE_OPTIONS,
      preferredVoice: 'aura-2-orion-en',
    });
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamRespond()) });
      }
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.sendAnswer('Flight review every 24 months.');
    const studentInitials = practice.studentMessages.first().locator('[data-testid="message-avatar-initials"]');
    await expect(studentInitials).toContainText('?');
  });

  test('student sender label shows userName', async ({ page }) => {
    await setupStandardMocks(page, {
      displayName: 'Mike',
      voiceOptions: MOCK_VOICE_OPTIONS,
      preferredVoice: 'aura-2-orion-en',
    });
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamRespond()) });
      }
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.sendAnswer('Three takeoffs and landings in 90 days.');
    await practice.expectStudentSenderLabel('Mike');
  });

  test('student sender label shows "APPLICANT" fallback', async ({ page }) => {
    await setupStandardMocks(page, { displayName: null });
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');
      if (body.action === 'start') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamRespond()) });
      }
    });
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();
    await practice.sendAnswer('I need a valid medical.');
    await practice.expectStudentSenderLabel('APPLICANT');
  });

  test('userName from onboarding wizard appears in bubbles immediately', async ({ page }) => {
    await setupStandardMocks(page, { onboardingCompleted: false });
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
    });
    const practice = new PracticePage(page);
    await practice.goto();

    // Navigate through wizard with name
    await page.getByTestId('wizard-step1-next').click();
    await page.getByTestId('wizard-step2-next').click();
    await practice.wizardNameInput.fill('Jenny');
    await practice.wizardStep3Next.click();
    await page.getByTestId('wizard-step4-next').click();
    await practice.wizardStartButton.click();

    // Wait for first examiner message
    await expect(practice.examinerMessages.first()).toBeVisible({ timeout: 15000 });
    // Examiner label should show persona name (from mock voice options)
    await practice.expectExaminerSenderLabel('Bob Mitchell');
  });
});
