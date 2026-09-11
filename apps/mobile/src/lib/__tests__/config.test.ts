import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => vi.unstubAllEnvs());
it('keeps user-visible legal links canonical when the API targets staging', async () => {
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://staging.example');
  vi.resetModules();
  const { config } = await import('../config');
  expect(config.apiUrl).toBe('https://staging.example');
  expect(new URL('/privacy', config.publicUrl).href).toBe('https://heydpe.com/privacy');
  expect(new URL('/terms', config.publicUrl).href).toBe('https://heydpe.com/terms');
});
