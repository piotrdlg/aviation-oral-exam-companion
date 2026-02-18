import { test, expect } from '@playwright/test';

/**
 * JSON-LD structured data tests.
 *
 * Covers:
 * - Landing page Organization schema (from root layout)
 * - Landing page SoftwareApplication schema
 * - Pricing page FAQPage schema
 * - Privacy page Organization schema (from root layout)
 */

/**
 * Extract all JSON-LD objects from the page.
 * Returns an array of parsed objects.
 */
async function getJsonLdObjects(page: import('@playwright/test').Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results: Record<string, unknown>[] = [];
    scripts.forEach((script) => {
      try {
        results.push(JSON.parse(script.textContent || ''));
      } catch {
        // skip malformed JSON-LD
      }
    });
    return results;
  });
}

test.describe('JSON-LD — Landing Page (/)', () => {
  test('has Organization schema with correct fields', async ({ page }) => {
    await page.goto('/');
    const jsonLdObjects = await getJsonLdObjects(page);

    const org = jsonLdObjects.find(
      (obj) => obj['@type'] === 'Organization'
    );
    expect(org, 'Expected Organization JSON-LD on landing page').toBeTruthy();
    expect(org!['name']).toBe('HeyDPE');
    expect(org!['legalName']).toBe('Imagine Flying LLC');
    expect(org!['url']).toBe('https://heydpe.com');
  });

  test('has SoftwareApplication schema with correct fields', async ({ page }) => {
    await page.goto('/');
    const jsonLdObjects = await getJsonLdObjects(page);

    const app = jsonLdObjects.find(
      (obj) => obj['@type'] === 'SoftwareApplication'
    );
    expect(app, 'Expected SoftwareApplication JSON-LD on landing page').toBeTruthy();
    expect(app!['applicationCategory']).toBe('EducationalApplication');

    const offers = app!['offers'] as Record<string, unknown>;
    expect(offers).toBeTruthy();
    expect(offers['price']).toBe('39.00');
  });
});

test.describe('JSON-LD — Pricing Page (/pricing)', () => {
  test('has FAQPage schema with mainEntity array', async ({ page }) => {
    await page.goto('/pricing');
    const jsonLdObjects = await getJsonLdObjects(page);

    const faqPage = jsonLdObjects.find(
      (obj) => obj['@type'] === 'FAQPage'
    );
    expect(faqPage, 'Expected FAQPage JSON-LD on pricing page').toBeTruthy();

    const mainEntity = faqPage!['mainEntity'] as Record<string, unknown>[];
    expect(Array.isArray(mainEntity)).toBe(true);
    expect(mainEntity.length).toBeGreaterThan(0);

    // Each entry should be a Question with an acceptedAnswer
    for (const item of mainEntity) {
      expect(item['@type']).toBe('Question');
      expect(item['name']).toBeTruthy();
      const answer = item['acceptedAnswer'] as Record<string, unknown>;
      expect(answer).toBeTruthy();
      expect(answer['@type']).toBe('Answer');
      expect(answer['text']).toBeTruthy();
    }
  });
});

test.describe('JSON-LD — Privacy Page (/privacy)', () => {
  test('has Organization schema from root layout', async ({ page }) => {
    await page.goto('/privacy');
    const jsonLdObjects = await getJsonLdObjects(page);

    const org = jsonLdObjects.find(
      (obj) => obj['@type'] === 'Organization'
    );
    expect(org, 'Expected Organization JSON-LD on privacy page (from root layout)').toBeTruthy();
    expect(org!['name']).toBe('HeyDPE');
  });
});
