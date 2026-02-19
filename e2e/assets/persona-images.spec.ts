import { test, expect } from '@playwright/test';

test.describe('Static Assets — Persona Images and Default Avatars', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const PERSONA_IMAGES = [
    '/personas/bob-mitchell.webp',
    '/personas/jim-hayes.webp',
    '/personas/karen-sullivan.webp',
    '/personas/maria-torres.webp',
  ];

  const DEFAULT_AVATARS = [
    '/avatars/default-1.webp',
    '/avatars/default-2.webp',
    '/avatars/default-3.webp',
    '/avatars/default-4.webp',
    '/avatars/default-5.webp',
    '/avatars/default-6.webp',
  ];

  test('all 4 DPE persona images are accessible (not 404)', async ({ request }) => {
    for (const img of PERSONA_IMAGES) {
      const response = await request.get(img);
      expect(response.status(), `${img} should return 200`).toBe(200);
    }
  });

  test('all 6 default avatar images are accessible (not 404)', async ({ request }) => {
    for (const img of DEFAULT_AVATARS) {
      const response = await request.get(img);
      expect(response.status(), `${img} should return 200`).toBe(200);
    }
  });
});
