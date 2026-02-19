import { test, expect } from '@playwright/test';
import path from 'path';

// Admin tests use admin auth state
test.use({ storageState: path.join(__dirname, '../.auth/admin.json') });

const PERSONA_KEYS = [
  { value: 'persona_bob_mitchell', label: 'Persona: Bob Mitchell' },
  { value: 'persona_jim_hayes', label: 'Persona: Jim Hayes' },
  { value: 'persona_karen_sullivan', label: 'Persona: Karen Sullivan' },
  { value: 'persona_maria_torres', label: 'Persona: Maria Torres' },
];

const MOCK_PERSONA_VERSIONS = [
  {
    id: 'pv-bob-1',
    prompt_key: 'persona_bob_mitchell',
    version: 1,
    content: 'You are Bob Mitchell, a veteran DPE with 30 years of experience...',
    status: 'published',
    change_summary: 'Initial persona definition',
    created_at: '2026-02-01T00:00:00Z',
    published_at: '2026-02-01T00:00:00Z',
  },
];

test.describe('Admin Prompts — Persona Prompt Keys', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/prompts*', async (route) => {
      const url = route.request().url();
      if (url.includes('persona_bob_mitchell')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ versions: MOCK_PERSONA_VERSIONS }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ versions: [] }),
        });
      }
    });
  });

  test('all 4 persona keys appear in prompt key dropdown', async ({ page }) => {
    await page.goto('/admin/prompts');
    const select = page.getByTestId('prompt-key-select');
    await expect(select).toBeVisible();

    for (const key of PERSONA_KEYS) {
      const option = select.locator(`option[value="${key.value}"]`);
      await expect(option).toBeAttached();
    }
  });

  test('persona option labels match "Persona: Name" format', async ({ page }) => {
    await page.goto('/admin/prompts');
    const select = page.getByTestId('prompt-key-select');

    for (const key of PERSONA_KEYS) {
      const option = select.locator(`option[value="${key.value}"]`);
      await expect(option).toHaveText(key.label);
    }
  });

  test('selecting persona_bob_mitchell fetches its versions', async ({ page }) => {
    let fetchedUrl = '';
    await page.route('**/api/admin/prompts*', async (route) => {
      fetchedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ versions: MOCK_PERSONA_VERSIONS }),
      });
    });

    await page.goto('/admin/prompts');
    const select = page.getByTestId('prompt-key-select');
    await select.selectOption('persona_bob_mitchell');
    // Wait for fetch to complete
    await page.waitForTimeout(500);
    expect(fetchedUrl).toContain('persona_bob_mitchell');
  });

  test('persona prompt version shows published status', async ({ page }) => {
    await page.goto('/admin/prompts');
    const select = page.getByTestId('prompt-key-select');
    await select.selectOption('persona_bob_mitchell');
    // Wait for versions to load
    await page.waitForTimeout(500);
    await expect(page.getByText(/published/i).first()).toBeVisible();
  });
});
