import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';
import { makeTierResponse, MOCK_VOICE_OPTIONS } from '../helpers/persona-mocks';

const MOCK_STRIPE_STATUS = { tier: 'checkride_prep', status: 'free' };

test.describe('Settings — Profile Section', () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/stripe/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STRIPE_STATUS) });
    });
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [{ id: 's1', device_label: 'Chrome on macOS', this_device: true, is_exam_active: false, last_activity_at: new Date().toISOString(), created_at: new Date().toISOString(), approximate_location: null }] }) });
    });
    settings = new SettingsPage(page);
  });

  test('profile section is visible', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
    });
    await settings.goto();
    await expect(settings.profileSection).toBeVisible();
  });

  test('shows "?" initials when no avatar and no name', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ displayName: null, avatarUrl: null })) });
    });
    await settings.goto();
    await expect(settings.profileAvatarInitials).toContainText('?');
  });

  test('shows first char of displayName as initials when no avatarUrl', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ displayName: 'Mike', avatarUrl: null })) });
    });
    await settings.goto();
    await expect(settings.profileAvatarInitials).toContainText('M');
  });

  test('shows avatar image when avatarUrl is set', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ avatarUrl: '/avatars/default-3.webp' })) });
    });
    await settings.goto();
    await expect(settings.profileAvatarImg).toBeVisible();
  });

  test('6 default avatar buttons are shown', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
    });
    await settings.goto();
    const avatarButtons = page.locator('[data-testid^="default-avatar-"]');
    await expect(avatarButtons).toHaveCount(6);
  });

  test('clicking default avatar POSTs avatarUrl to /api/user/tier', async ({ page }) => {
    let postedData: Record<string, unknown> = {};
    await page.route('**/api/user/tier', async (route) => {
      if (route.request().method() === 'POST') {
        postedData = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
      }
    });
    await settings.goto();
    await settings.selectDefaultAvatar('default-2');
    expect(postedData.avatarUrl).toBe('/avatars/default-2.webp');
  });

  test('display name input shows existing name', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ displayName: 'Mike' })) });
    });
    await settings.goto();
    await expect(settings.displayNameInput).toHaveValue('Mike');
  });

  test('display name saves on blur via POST', async ({ page }) => {
    let postedData: Record<string, unknown> = {};
    await page.route('**/api/user/tier', async (route) => {
      if (route.request().method() === 'POST') {
        postedData = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
      }
    });
    await settings.goto();
    await settings.setDisplayName('Captain Smith');
    expect(postedData.displayName).toBe('Captain Smith');
  });

  test('display name enforces maxLength=50', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
    });
    await settings.goto();
    await expect(settings.displayNameInput).toHaveAttribute('maxlength', '50');
  });

  test('upload photo label and hint text are present', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
    });
    await settings.goto();
    await expect(settings.avatarUploadLabel).toBeVisible();
    await expect(page.getByText('Max 2MB. JPG, PNG, or WebP.')).toBeVisible();
  });

  test('display name input has correct placeholder', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse()) });
    });
    await settings.goto();
    await expect(settings.displayNameInput).toHaveAttribute('placeholder', 'How should the examiner address you?');
  });
});

test.describe('Settings — Voice Cards with Persona Images', () => {
  test('voice cards show persona images when option.image is set', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ voiceOptions: MOCK_VOICE_OPTIONS })) });
    });
    await page.route('**/api/stripe/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tier: 'checkride_prep', status: 'free' }) });
    });
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
    });
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.voiceCardPersonaImgs.first()).toBeVisible();
    await expect(settings.voiceCardPersonaImgs).toHaveCount(4);
  });

  test('voice card without image omits persona img', async ({ page }) => {
    const voiceOptionsNoImage = [{ model: 'voice_basic', label: 'Basic Voice', desc: 'Default' }];
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ voiceOptions: voiceOptionsNoImage })) });
    });
    await page.route('**/api/stripe/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tier: 'checkride_prep', status: 'free' }) });
    });
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
    });
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(settings.voiceCardPersonaImgs).toHaveCount(0);
  });

  test('active voice card shows ACTIVE badge', async ({ page }) => {
    await page.route('**/api/user/tier', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeTierResponse({ voiceOptions: MOCK_VOICE_OPTIONS, preferredVoice: 'aura-2-orion-en' })) });
    });
    await page.route('**/api/stripe/status', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tier: 'checkride_prep', status: 'free' }) });
    });
    await page.route('**/api/user/sessions', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
    });
    const settings = new SettingsPage(page);
    await settings.goto();
    const bobCard = page.getByTestId('voice-card-aura-2-orion-en');
    await expect(bobCard).toContainText('ACTIVE');
  });
});
