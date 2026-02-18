import { type Page, type Request } from '@playwright/test';

export async function mockPostHogEndpoints(page: Page): Promise<{ requests: Request[] }> {
  const requests: Request[] = [];
  await page.route('**/us.i.posthog.com/**', async (route) => {
    requests.push(route.request());
    await route.fulfill({ status: 200, body: '{}', contentType: 'application/json' });
  });
  return { requests };
}

export async function mockGA4Collect(page: Page): Promise<{ requests: Request[] }> {
  const requests: Request[] = [];
  await page.route('**/google-analytics.com/mp/collect**', async (route) => {
    requests.push(route.request());
    await route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
  });
  return { requests };
}

export async function mockClarityScript(page: Page): Promise<void> {
  await page.route('**/clarity.ms/**', async (route) => {
    await route.fulfill({ status: 200, body: '', contentType: 'text/javascript' });
  });
}

export async function mockAllExternalAnalytics(page: Page): Promise<{
  posthog: Request[];
  ga4: Request[];
}> {
  const posthog = await mockPostHogEndpoints(page);
  const ga4 = await mockGA4Collect(page);
  await mockClarityScript(page);
  return { posthog: posthog.requests, ga4: ga4.requests };
}
