import { test, expect } from '@playwright/test';
import { PracticePage } from '../pages/PracticePage';
import { setupStandardMocks, makeTierResponse, makeExamStart } from '../helpers/persona-mocks';

test.describe('Onboarding Wizard — Step 3 Name Collection', () => {
  let practice: PracticePage;

  test.beforeEach(async ({ page }) => {
    await setupStandardMocks(page, { onboardingCompleted: false });
    await page.route('**/api/exam', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeExamStart()) });
    });
    practice = new PracticePage(page);
    await practice.goto();
  });

  test('wizard shows 5 progress dots', async ({ page }) => {
    await expect(practice.onboardingWizard).toBeVisible();
    const dots = page.locator('[data-testid^="wizard-dot-"]');
    await expect(dots).toHaveCount(5);
  });

  test('step 3 shows "WHAT SHOULD WE CALL YOU?" heading', async ({ page }) => {
    await practice.navigateThroughWizardToStep3();
    await expect(page.getByTestId('wizard-step-3')).toContainText('WHAT SHOULD WE CALL YOU?');
  });

  test('step 3 name input has correct placeholder', async () => {
    await practice.navigateThroughWizardToStep3();
    await expect(practice.wizardNameInput).toHaveAttribute('placeholder', 'e.g., Mike, Sarah, Captain Smith');
  });

  test('button shows SKIP when name is empty', async () => {
    await practice.navigateThroughWizardToStep3();
    await expect(practice.wizardStep3Next).toContainText('SKIP');
  });

  test('button shows NEXT when name is entered', async () => {
    await practice.navigateThroughWizardToStep3();
    await practice.wizardNameInput.fill('Mike');
    await expect(practice.wizardStep3Next).toContainText('NEXT');
  });

  test('back button returns to step 2', async ({ page }) => {
    await practice.navigateThroughWizardToStep3();
    await practice.wizardStep3Back.click();
    await expect(page.getByTestId('wizard-step-2')).toBeVisible();
  });

  test('can skip name step and advance to step 4', async ({ page }) => {
    await practice.navigateThroughWizardToStep3();
    await practice.wizardStep3Next.click();
    await expect(page.getByTestId('wizard-step-4')).toBeVisible();
  });

  test('entering name and clicking NEXT advances to step 4', async ({ page }) => {
    await practice.navigateThroughWizardToStep3();
    await practice.wizardNameInput.fill('Sarah');
    await practice.wizardStep3Next.click();
    await expect(page.getByTestId('wizard-step-4')).toBeVisible();
  });

  test('name input enforces maxLength=50', async () => {
    await practice.navigateThroughWizardToStep3();
    await expect(practice.wizardNameInput).toHaveAttribute('maxlength', '50');
  });

  test('completing wizard POSTs displayName to /api/user/tier', async ({ page }) => {
    let postedData: Record<string, unknown> = {};
    await page.route('**/api/user/tier', async (route) => {
      if (route.request().method() === 'POST') {
        postedData = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ onboardingCompleted: false })) });
      }
    });

    await practice.goto();
    // Step 1: select rating
    await page.getByTestId('wizard-step1-next').click();
    // Step 2: accept defaults
    await page.getByTestId('wizard-step2-next').click();
    // Step 3: enter name
    await practice.wizardNameInput.fill('Captain Jones');
    await practice.wizardStep3Next.click();
    // Step 4: accept theme
    await page.getByTestId('wizard-step4-next').click();
    // Step 5: start
    await practice.wizardStartButton.click();
    // Verify the POST included displayName
    expect(postedData.displayName).toBe('Captain Jones');
  });

  test('completing wizard with no name POSTs null displayName', async ({ page }) => {
    let postedData: Record<string, unknown> = {};
    await page.route('**/api/user/tier', async (route) => {
      if (route.request().method() === 'POST') {
        postedData = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ onboardingCompleted: false })) });
      }
    });

    await practice.goto();
    await page.getByTestId('wizard-step1-next').click();
    await page.getByTestId('wizard-step2-next').click();
    // Skip name step
    await practice.wizardStep3Next.click();
    await page.getByTestId('wizard-step4-next').click();
    await practice.wizardStartButton.click();
    expect(postedData.displayName).toBeNull();
  });

  test('skip link bypasses all wizard steps', async ({ page }) => {
    await practice.wizardSkip.click();
    await expect(practice.onboardingWizard).not.toBeVisible();
  });
});
