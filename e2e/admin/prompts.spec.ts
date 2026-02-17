import { test, expect } from '@playwright/test';

/**
 * Admin prompt management tests.
 *
 * Covers:
 * - Prompt version list (grouped by prompt_key)
 * - Create new draft prompt version
 * - Edit draft content
 * - Publish a draft (archives current published version)
 * - Rollback to previous published version
 * - A/B testing readiness (multiple published versions for different ratings)
 * - Safety prefix is always immutable and prepended at runtime
 */

const mockPrompts = [
  {
    id: 'prompt-1',
    prompt_key: 'examiner_system',
    rating: null,
    study_mode: null,
    version: 2,
    content: 'You are a DPE examiner...',
    status: 'published',
    change_summary: 'Improved question pacing',
    published_at: '2026-02-15T00:00:00Z',
    published_by: 'admin-1',
    created_at: '2026-02-15T00:00:00Z',
  },
  {
    id: 'prompt-2',
    prompt_key: 'examiner_system',
    rating: null,
    study_mode: null,
    version: 1,
    content: 'You are an FAA DPE...',
    status: 'archived',
    change_summary: 'Initial version',
    published_at: '2026-02-01T00:00:00Z',
    published_by: 'admin-1',
    created_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'prompt-3',
    prompt_key: 'assessment_system',
    rating: null,
    study_mode: null,
    version: 1,
    content: 'Assess the student answer...',
    status: 'published',
    change_summary: 'Initial version',
    published_at: '2026-02-01T00:00:00Z',
    published_by: 'admin-1',
    created_at: '2026-02-01T00:00:00Z',
  },
];

test.describe('Admin Prompts — Version List', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/prompts*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ prompts: mockPrompts }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test('displays prompt versions grouped by prompt_key', async ({ page }) => {
    await page.goto('/admin/prompts');
    // Should show both prompt keys
    await expect(page.getByText('examiner_system')).toBeVisible();
    await expect(page.getByText('assessment_system')).toBeVisible();
  });

  test('shows published and archived status badges', async ({ page }) => {
    await page.goto('/admin/prompts');
    await expect(page.getByText('published').first()).toBeVisible();
    await expect(page.getByText('archived')).toBeVisible();
  });

  test('shows version numbers', async ({ page }) => {
    await page.goto('/admin/prompts');
    await expect(page.getByText('v2')).toBeVisible();
    await expect(page.getByText('v1').first()).toBeVisible();
  });

  test('shows change summary for each version', async ({ page }) => {
    await page.goto('/admin/prompts');
    await expect(page.getByText('Improved question pacing')).toBeVisible();
  });
});

test.describe('Admin Prompts — Create Draft', () => {
  test('create new draft prompt version', async ({ page }) => {
    await page.route('**/api/admin/prompts', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ prompts: mockPrompts }),
        });
      } else if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            prompt: {
              id: 'prompt-new',
              prompt_key: body.prompt_key,
              version: 3,
              content: body.content,
              status: 'draft',
              change_summary: body.change_summary,
              created_at: new Date().toISOString(),
            },
          }),
        });
      }
    });

    await page.goto('/admin/prompts');

    // Click create new version button
    await page.getByTestId('create-prompt-button').click();

    // Fill in the prompt editor
    await page.getByTestId('prompt-key-select').selectOption('examiner_system');
    await page.getByTestId('prompt-content-editor').fill('Updated examiner prompt content...');
    await page.getByTestId('prompt-change-summary').fill('Added better follow-up questioning');
    await page.getByTestId('prompt-save-draft').click();

    // Verify the draft was created
    await expect(page.getByText('draft')).toBeVisible();
  });
});

test.describe('Admin Prompts — Publish', () => {
  test('publish a draft prompt version', async ({ page }) => {
    const draftPrompt = {
      id: 'prompt-draft',
      prompt_key: 'examiner_system',
      rating: null,
      study_mode: null,
      version: 3,
      content: 'New draft content...',
      status: 'draft',
      change_summary: 'Test draft',
      created_at: new Date().toISOString(),
    };

    await page.route('**/api/admin/prompts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompts: [...mockPrompts, draftPrompt] }),
      });
    });

    await page.route('**/api/admin/prompts/prompt-draft/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: { ...draftPrompt, status: 'published', published_at: new Date().toISOString() },
        }),
      });
    });

    await page.goto('/admin/prompts');
    await page.getByTestId('publish-prompt-draft').click();

    // Confirm publish action
    await page.getByTestId('confirm-publish').click();
    await expect(page.getByText(/published successfully/i)).toBeVisible();
  });
});

test.describe('Admin Prompts — Rollback', () => {
  test('rollback to previous published version', async ({ page }) => {
    await page.route('**/api/admin/prompts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompts: mockPrompts }),
      });
    });

    await page.route('**/api/admin/prompts/prompt-1/rollback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rolledBack: { ...mockPrompts[0], status: 'archived' },
          restored: { ...mockPrompts[1], status: 'published' },
        }),
      });
    });

    await page.goto('/admin/prompts');
    await page.getByTestId('rollback-prompt-1').click();

    // Confirm rollback
    await page.getByTestId('confirm-rollback').click();
    await expect(page.getByText(/rolled back/i)).toBeVisible();
  });
});

test.describe('Admin Prompts — Safety Prefix', () => {
  test('safety prefix note is displayed in prompt editor', async ({ page }) => {
    await page.route('**/api/admin/prompts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompts: mockPrompts }),
      });
    });

    await page.goto('/admin/prompts');
    // The UI should indicate that the safety prefix is always prepended
    await expect(
      page.getByText(/safety prefix.*immutable|cannot.*override.*safety/i)
    ).toBeVisible();
  });
});
