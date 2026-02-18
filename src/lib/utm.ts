export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

const UTM_KEYS: (keyof UTMParams)[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const STORAGE_KEY = 'heydpe_utm';

export function captureUTMParams(): UTMParams | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const utm: UTMParams = {};
  let found = false;
  for (const key of UTM_KEYS) {
    const val = params.get(key);
    if (val) { utm[key] = val; found = true; }
  }
  if (!found) return null;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm)); } catch {}
  return utm;
}

export function getStoredUTMParams(): UTMParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
