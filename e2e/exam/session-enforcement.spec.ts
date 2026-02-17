import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';

/**
 * Session enforcement tests.
 *
 * Covers:
 * - One active exam per user enforcement
 * - Starting a new exam pauses the previous one
 * - Paused session notification displayed
 * - Stale session (on another device) rejected on respond/next-task
 * - Paused exam notification banner
 */

test.describe('Session Enforcement — One Active Exam', () => {
  test('starting a new exam pauses existing exam on another device', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'PA.I.A',
          taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Welcome. Your exam on another device has been paused.',
          pausedSessionId: 'other-session-id',
        }),
      });
    });

    await page.route('**/api/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 'new-session-id', status: 'active' } }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();

    // Should show paused session notification
    await practice.expectPausedSessionNotice();
  });

  test('no paused session notice when no other exam is active', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'PA.I.A',
          taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Welcome to the exam.',
          // No pausedSessionId — no other active exam
        }),
      });
    });

    await page.route('**/api/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 'session-id', status: 'active' } }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();

    await expect(practice.pausedSessionNotice).not.toBeVisible();
  });
});

test.describe('Session Enforcement — Stale Session Rejection', () => {
  test('respond action on stale session returns error', async ({ page }) => {
    let responseCount = 0;

    await page.route('**/api/exam', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}');

      if (body.action === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            taskId: 'PA.I.A',
            taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
            examinerMessage: 'Welcome.',
          }),
        });
      } else if (body.action === 'respond') {
        responseCount++;
        if (responseCount > 1) {
          // Second respond — stale session
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'session_conflict',
              message: 'This exam session is no longer active. A new session was started on another device.',
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              taskId: 'PA.I.A',
              taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
              examinerMessage: 'Good answer.',
              assessment: { score: 'satisfactory', feedback: 'Correct.', misconceptions: [] },
            }),
          });
        }
      }
    });

    await page.route('**/api/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 'session-id', status: 'active' } }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();

    // First respond — succeeds
    await practice.sendAnswer('First answer');
    await practice.expectAssessmentBadge(0, 'satisfactory');

    // Second respond — stale session
    await practice.sendAnswer('Second answer');
    await expect(page.getByText(/no longer active|another device/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Session Enforcement — Pause Notification', () => {
  test('paused session notification includes helpful text', async ({ page }) => {
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskId: 'PA.I.A',
          taskData: { id: 'PA.I.A', area: 'I.', task: 'A.', elements: [] },
          examinerMessage: 'Welcome.',
          pausedSessionId: 'old-session',
        }),
      });
    });

    await page.route('**/api/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: { id: 'new-session', status: 'active' } }),
      });
    });

    await page.route('**/api/tts', async (route) => {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(100) });
    });

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExam();

    const notice = practice.pausedSessionNotice;
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/paused|another device|progress.*saved/i);
  });
});
