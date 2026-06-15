import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';
import { setupStandardMocks, makeExamStart, makeExamRespond } from '../helpers/persona-mocks';

/**
 * First-exam FAA disclaimer flow (W6.5).
 *
 * Regression guard for the stale-closure bug where clicking "I understand —
 * begin" ONCE did nothing: startSession() closed over disclaimerAcknowledged
 * (false), so re-invoking it from the acknowledge handler re-opened the modal
 * instead of starting. The fix passes an explicit disclaimerOverride to startSession.
 *
 * A user who has NOT acknowledged is surfaced the modal by overriding the
 * /api/user/tier response's `disclaimerAcknowledged` to false (the practice
 * page reads it into state; the optimistic default is true).
 *
 * Fully mocked — no real backend. This is the only kind of test that exercises
 * the real closure-under-React-batching path (the repo has no RTL/jsdom).
 */

async function mockExamStartAndConsent(page: import('@playwright/test').Page) {
  await page.route('**/api/exam', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body.action === 'start' ? makeExamStart() : makeExamRespond()),
    });
  });
  await page.route('**/api/consent', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

test.describe('Practice — first-exam FAA disclaimer', () => {
  test('one click on "I understand — begin" closes the modal and starts the exam', async ({ page }) => {
    await setupStandardMocks(page, { disclaimerAcknowledged: false });
    await mockExamStartAndConsent(page);

    const practice = new PracticePage(page);
    await practice.goto();

    // Starting an exam surfaces the disclaimer first (not an examiner turn).
    await practice.startExamButton.click();
    await expect(practice.disclaimerModal).toBeVisible();
    await expect(practice.examinerMessages).toHaveCount(0);

    // The bug: this single click did nothing (modal re-opened). Click EXACTLY once.
    await practice.disclaimerBeginButton.click();

    // Robust discriminator: the examiner turn only renders if startSession actually
    // proceeded. Pre-fix it never appears and the modal stays.
    await expect(practice.examinerMessages.first()).toBeVisible({ timeout: 30_000 });
    await expect(practice.disclaimerModal).toBeHidden();
  });

  test('"Not now" cancels without starting an exam', async ({ page }) => {
    await setupStandardMocks(page, { disclaimerAcknowledged: false });
    await mockExamStartAndConsent(page);

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await expect(practice.disclaimerModal).toBeVisible();

    await page.getByRole('button', { name: /not now/i }).click();
    await expect(practice.disclaimerModal).toBeHidden();
    await expect(practice.examinerMessages).toHaveCount(0);
  });

  test('an already-acknowledged user is not shown the disclaimer', async ({ page }) => {
    // default optimistic state is true, and the tier mock leaves it acknowledged
    await setupStandardMocks(page, { disclaimerAcknowledged: true });
    await mockExamStartAndConsent(page);

    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();

    // Goes straight to the exam — no disclaimer gate.
    await expect(practice.examinerMessages.first()).toBeVisible({ timeout: 30_000 });
    await expect(practice.disclaimerModal).toHaveCount(0);
  });
});
