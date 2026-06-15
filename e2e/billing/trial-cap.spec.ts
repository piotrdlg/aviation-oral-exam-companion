import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';

/**
 * App-side free-trial cap tests (decision D5, 2026-06-14).
 *
 * The free trial is enforced server-side in POST /api/session (action:'create'):
 *   - 3 exams created      → 403 { error: 'trial_limit_reached' }  (checked first)
 *   - 7 days from signup   → 403 { error: 'trial_expired' }
 *   - ever subscribed      → 403 { error: 'resubscribe_required' }
 * All three route through the SAME upgrade modal (quotaModalCopy) with
 * reason-specific copy. These specs mock ONLY the create POST and assert the
 * modal heading — the deterministic gate logic itself is unit-tested in
 * src/lib/__tests__/session-policy.test.ts.
 *
 * NOTE: the mock intercepts only POST .../api/session with action:'create';
 * GET /api/session (resumable list, stats) falls through to the real backend.
 */

async function mockTrialBlock(page: import('@playwright/test').Page, reason: string) {
  await page.route('**/api/session', async (route) => {
    const req = route.request();
    let isCreate = false;
    if (req.method() === 'POST') {
      try {
        isCreate = JSON.parse(req.postData() ?? '{}').action === 'create';
      } catch {
        isCreate = false;
      }
    }
    if (isCreate) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: reason, upgrade_url: '/pricing' }),
      });
    } else {
      await route.fallback();
    }
  });
}

test.describe('Free trial cap — create blocked → upgrade modal', () => {
  test('3-exam cap → "Free exams used"', async ({ page }) => {
    await mockTrialBlock(page, 'trial_limit_reached');
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();
    await expect(practice.upgradeModal).toContainText(/free exams used/i);
  });

  test('7-day window elapsed → "Trial ended"', async ({ page }) => {
    await mockTrialBlock(page, 'trial_expired');
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();
    await expect(practice.upgradeModal).toContainText(/trial ended/i);
  });

  test('churned payer → "Subscription ended" (Resubscribe)', async ({ page }) => {
    await mockTrialBlock(page, 'resubscribe_required');
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();
    await expect(practice.upgradeModal).toContainText(/subscription ended|resubscribe/i);
  });

  test('upgrade modal links to /pricing', async ({ page }) => {
    await mockTrialBlock(page, 'trial_expired');
    const practice = new PracticePage(page);
    await practice.goto();
    await practice.startExamButton.click();
    await practice.expectUpgradeModal();
    const link = practice.upgradeModal.getByRole('link', { name: /plan|pricing|upgrade/i });
    await expect(link).toHaveAttribute('href', /\/pricing/);
  });
});
