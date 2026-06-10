import { type Page } from '@playwright/test';

interface ConsentData {
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

interface DataLayerEvent extends Record<string, unknown> {
  event?: string;
}

interface WindowWithDataLayer extends Window {
  dataLayer?: Array<Record<string, unknown> | unknown[]>;
}

export async function clearConsentStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('heydpe_consent'));
}

export async function setConsentStorage(
  page: Page,
  prefs: { analytics: boolean; marketing: boolean }
): Promise<void> {
  await page.evaluate(
    (p: { analytics: boolean; marketing: boolean }) => localStorage.setItem('heydpe_consent', JSON.stringify({ ...p, timestamp: Date.now() })),
    prefs
  );
}

export async function getConsentStorage(
  page: Page
): Promise<{ analytics: boolean; marketing: boolean; timestamp: number } | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('heydpe_consent');
    return raw ? JSON.parse(raw) : null;
  });
}

export async function clearUTMStorage(page: Page): Promise<void> {
  await page.evaluate(() => sessionStorage.removeItem('heydpe_utm'));
}

export async function getUTMStorage(page: Page): Promise<Record<string, string> | null> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('heydpe_utm');
    return raw ? JSON.parse(raw) : null;
  });
}

export async function getDataLayer(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as WindowWithDataLayer).dataLayer || []);
}

export async function getDataLayerEvents(page: Page, eventName: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (name: string) => {
      const dataLayer = (window as WindowWithDataLayer).dataLayer || [];
      return dataLayer.filter((e): e is Record<string, unknown> => typeof e === 'object' && !Array.isArray(e) && e !== null && 'event' in e && e.event === name);
    },
    eventName
  );
}

export async function getConsentUpdates(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const dataLayer = (window as WindowWithDataLayer).dataLayer || [];
    return dataLayer.filter((e): e is unknown[] => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update');
  });
}
