import { test, expect } from '@playwright/test';

/**
 * Admin system config page tests.
 *
 * Covers:
 * - Kill switch toggles for each provider (Anthropic, OpenAI, Deepgram, Cartesia)
 * - Kill switch toggles for each tier (ground_school, checkride_prep, dpe_live)
 * - Maintenance mode toggle with message input
 * - Hard cap configuration (daily LLM tokens, TTS chars, STT seconds)
 * - Config changes are persisted and take effect on next API request
 */

const mockConfig = [
  { key: 'kill_switch.anthropic', value: { enabled: false }, description: 'Disable Anthropic API calls' },
  { key: 'kill_switch.openai', value: { enabled: false }, description: 'Disable OpenAI API calls' },
  { key: 'kill_switch.deepgram', value: { enabled: false }, description: 'Disable Deepgram API calls' },
  { key: 'kill_switch.cartesia', value: { enabled: false }, description: 'Disable Cartesia API calls' },
  { key: 'kill_switch.tier.ground_school', value: { enabled: false }, description: 'Disable ground_school tier' },
  { key: 'kill_switch.tier.checkride_prep', value: { enabled: false }, description: 'Disable checkride_prep tier' },
  { key: 'kill_switch.tier.dpe_live', value: { enabled: false }, description: 'Disable dpe_live tier' },
  { key: 'maintenance_mode', value: { enabled: false, message: '' }, description: 'Global maintenance mode' },
  { key: 'user_hard_caps', value: { daily_llm_tokens: 100000, daily_tts_chars: 50000, daily_stt_seconds: 3600 }, description: 'Per-user daily hard caps' },
];

test.describe('Admin Config — Kill Switches', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: mockConfig }),
        });
      } else if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        // Update the mock config
        const idx = mockConfig.findIndex((c) => c.key === body.key);
        if (idx >= 0) {
          mockConfig[idx].value = body.value;
        }
        await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
      }
    });
  });

  test('displays all provider kill switch toggles', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.getByTestId('kill-switch-anthropic')).toBeVisible();
    await expect(page.getByTestId('kill-switch-openai')).toBeVisible();
    await expect(page.getByTestId('kill-switch-deepgram')).toBeVisible();
    await expect(page.getByTestId('kill-switch-cartesia')).toBeVisible();
  });

  test('displays all tier kill switch toggles', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.getByTestId('kill-switch-tier-ground_school')).toBeVisible();
    await expect(page.getByTestId('kill-switch-tier-checkride_prep')).toBeVisible();
    await expect(page.getByTestId('kill-switch-tier-dpe_live')).toBeVisible();
  });

  test('toggling a provider kill switch sends update to API', async ({ page }) => {
    await page.goto('/admin/config');

    let apiCalled = false;
    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}');
        expect(body.key).toBe('kill_switch.anthropic');
        expect(body.value.enabled).toBe(true);
        apiCalled = true;
        await route.fulfill({ status: 200, body: '{"ok":true}' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: mockConfig }),
        });
      }
    });

    await page.getByTestId('kill-switch-anthropic').click();
    expect(apiCalled).toBe(true);
  });

  test('kill switch shows status indicator (active/inactive)', async ({ page }) => {
    await page.goto('/admin/config');
    // All switches should be inactive (green/off) initially
    await expect(page.getByTestId('kill-switch-anthropic')).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('Admin Config — Maintenance Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: mockConfig }),
        });
      } else {
        await route.fulfill({ status: 200, body: '{"ok":true}' });
      }
    });
  });

  test('displays maintenance mode toggle', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.getByTestId('maintenance-mode-toggle')).toBeVisible();
  });

  test('maintenance mode has message input', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.getByTestId('maintenance-message-input')).toBeVisible();
  });

  test('enabling maintenance mode with message sends update', async ({ page }) => {
    let updatePayload: Record<string, unknown> = {};
    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'POST') {
        updatePayload = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ status: 200, body: '{"ok":true}' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: mockConfig }),
        });
      }
    });

    await page.goto('/admin/config');
    await page.getByTestId('maintenance-message-input').fill('Upgrading systems');
    await page.getByTestId('maintenance-mode-toggle').click();

    expect(updatePayload).toHaveProperty('key', 'maintenance_mode');
  });
});

test.describe('Admin Config — Hard Caps', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: mockConfig }),
        });
      } else {
        await route.fulfill({ status: 200, body: '{"ok":true}' });
      }
    });
  });

  test('displays hard cap configuration fields', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.getByTestId('hard-cap-llm-tokens')).toBeVisible();
    await expect(page.getByTestId('hard-cap-tts-chars')).toBeVisible();
    await expect(page.getByTestId('hard-cap-stt-seconds')).toBeVisible();
  });

  test('hard cap fields show current values', async ({ page }) => {
    await page.goto('/admin/config');
    await expect(page.getByTestId('hard-cap-llm-tokens')).toHaveValue('100000');
    await expect(page.getByTestId('hard-cap-tts-chars')).toHaveValue('50000');
    await expect(page.getByTestId('hard-cap-stt-seconds')).toHaveValue('3600');
  });

  test('updating hard cap sends API request', async ({ page }) => {
    let updatePayload: Record<string, unknown> = {};
    await page.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'POST') {
        updatePayload = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ status: 200, body: '{"ok":true}' });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: mockConfig }),
        });
      }
    });

    await page.goto('/admin/config');
    await page.getByTestId('hard-cap-llm-tokens').fill('200000');
    await page.getByTestId('save-hard-caps').click();

    expect(updatePayload).toHaveProperty('key', 'user_hard_caps');
  });
});
