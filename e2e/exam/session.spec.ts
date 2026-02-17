import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';

/**
 * Exam session end-to-end tests.
 *
 * Covers:
 * - Start exam with rating/class selection
 * - Examiner asks first question
 * - Student submits text answer
 * - Assessment badge displayed (satisfactory/unsatisfactory/partial)
 * - Examiner follow-up question
 * - End exam and session marked completed
 * - Multiple ratings supported (Private, Commercial, Instrument)
 * - Session created in backend on exam start
 */

test.describe('Exam Session — Full Flow', () => {
  let practice: PracticePage;

  test.beforeEach(async ({ page }) => {
    // Mock exam API
    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');

      if (body.action === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.A',
            taskData: {
              id: 'PA.I.A',
              area: 'I. Preflight Preparation',
              task: 'A. Pilot Qualifications',
              elements: ['PA.I.A.K1', 'PA.I.A.K2'],
            },
            examinerMessage: 'Welcome to your oral exam. Let us begin with pilot qualifications. Can you tell me the requirements to act as pilot in command of an aircraft?',
          }),
        });
      } else if (body.action === 'respond') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.A',
            taskData: body.taskData,
            examinerMessage: 'Good answer. Now, what about recent experience requirements?',
            assessment: {
              score: 'satisfactory',
              feedback: 'Correct understanding of 14 CFR 61.103 requirements.',
              misconceptions: [],
            },
          }),
        });
      } else if (body.action === 'next-task') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.B',
            taskData: {
              id: 'PA.I.B',
              area: 'I. Preflight Preparation',
              task: 'B. Airworthiness Requirements',
              elements: ['PA.I.B.K1'],
            },
            examinerMessage: 'Let us move to airworthiness. What documents must be on board the aircraft?',
          }),
        });
      }
    });

    // Mock session API
    await page.route('**/api/session', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ session: { id: 'test-session-id', status: 'active' } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sessions: [] }),
        });
      }
    });

    // Mock TTS to not actually make API calls
    await page.route('**/api/tts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.alloc(100), // Empty audio
      });
    });

    practice = new PracticePage(page);
    await practice.goto();
  });

  test('starts exam and receives first examiner question', async () => {
    await practice.configureSession({ rating: 'private' });
    await practice.startExam();
    await practice.expectExaminerMessage(0);
    const text = await practice.getExaminerMessageText(0);
    expect(text).toContain('pilot qualifications');
  });

  test('submits answer and receives assessment', async () => {
    await practice.configureSession({ rating: 'private' });
    await practice.startExam();
    await practice.sendAnswer('To act as PIC you need a valid pilot certificate, current medical, and a valid photo ID.');
    // Wait for assessment to appear
    await practice.expectAssessmentBadge(0, 'satisfactory');
  });

  test('examiner asks follow-up after student answer', async () => {
    await practice.configureSession({ rating: 'private' });
    await practice.startExam();
    await practice.sendAnswer('Valid pilot certificate and medical are required.');
    // After assessment, examiner should ask another question
    await practice.expectExaminerMessage(1);
    const followUp = await practice.getExaminerMessageText(1);
    expect(followUp).toContain('recent experience');
  });

  test('can end exam session', async ({ page }) => {
    await practice.configureSession({ rating: 'private' });
    await practice.startExam();
    await practice.endExam();
    // Session should be marked as ended
    await expect(page.getByText(/session.*ended|exam.*complete/i)).toBeVisible({ timeout: 10_000 });
  });

  test('displays current task area and name during exam', async () => {
    await practice.configureSession({ rating: 'private' });
    await practice.startExam();
    await expect(practice.currentTaskArea).toContainText(/preflight/i);
  });
});

test.describe('Exam Session — Rating Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'CA.I.A',
          taskData: { id: 'CA.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Welcome. Let us discuss commercial pilot privileges.',
        }),
      });
    });

    await page.route('**/api/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 'sess-commercial', status: 'active' } }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
    });
  });

  test('can select Commercial Pilot rating', async ({ page }) => {
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.configureSession({ rating: 'commercial' });
    await practice.startExam();
    const text = await practice.getExaminerMessageText(0);
    expect(text).toContain('commercial');
  });

  test('can select Instrument Rating', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'IR.I.A',
          taskData: { id: 'IR.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Let us discuss instrument flight rules.',
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.configureSession({ rating: 'instrument' });
    await practice.startExam();
    const text = await practice.getExaminerMessageText(0);
    expect(text).toContain('instrument');
  });

  test('rating select shows all three options', async ({ page }) => {
    const practice = new PracticePage(page);
    await practice.goto();
    const options = practice.ratingSelect.locator('option');
    await expect(options).toHaveCount(3); // private, commercial, instrument
  });
});

test.describe('Exam Session — Error Handling', () => {
  test('shows error when exam API fails', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await expect(practice.errorBanner).toBeVisible({ timeout: 10_000 });
  });

  test('shows loading state while waiting for examiner response', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      // Delay response to observe loading state
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'PA.I.A',
          taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Welcome to the exam.',
        }),
      });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await expect(practice.examLoading).toBeVisible();
  });
});
