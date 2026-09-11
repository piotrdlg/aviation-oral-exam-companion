import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { config } from './config';

/**
 * Consent-gated product analytics for HeyDPE mobile.
 *
 * Implemented as a thin HTTP client over PostHog's /capture API rather than the
 * posthog-react-native SDK — the app emits EXPLICIT funnel events, so SDK
 * autocapture/session-replay (and its heavy native peer deps) aren't needed, and
 * this avoids a native rebuild. 8 of the 11 funnel events already fire server-side
 * via the API routes the app calls (keyed on user.id); the native app emits only
 * the client-UI ones (voice_mode_toggled, paywall_shown, upgrade_clicked, …).
 *
 * Nothing is sent until consent is true AND a project key is configured. No PII
 * in properties — booleans/enums only (e.g. hasDisplayName, never the name).
 */
type Props = Record<string, string | number | boolean | null | undefined>;

const CONSENT_KEY = 'heydpe_analytics_consent';
const ANON_KEY = 'heydpe_analytics_anon_id';

function rand() {
  return `anon_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

let enabled = false;
let ready = false; // consent + anon id loaded from storage
let consentRevision = 0;
let anonId = rand(); // sync-initialised so it's never null; replaced by the persisted id on load
let distinctId: string = anonId; // user.id once identified, else the anon id
let identified = false; // distinctId is a real user id (don't realign it to anon on load)
// $set props from an identify() that happened before consent loaded — replayed on consent.
let pendingIdentify: Props | undefined;
const queue: { event: string; props: Props }[] = [];

/** Load persisted consent + anon id once at startup. Returns the consent state. */
export async function loadAnalyticsConsent(): Promise<boolean> {
  const revision = consentRevision;
  let stored: string | null = null;
  try {
    const [c, anon] = await Promise.all([
      AsyncStorage.getItem(CONSENT_KEY),
      AsyncStorage.getItem(ANON_KEY),
    ]);
    stored = c;
    if (anon) {
      anonId = anon;
      if (!identified) distinctId = anonId;
    } else {
      AsyncStorage.setItem(ANON_KEY, anonId).catch(() => {});
    }
  } catch {
    /* keep the sync-generated anonId */
  }
  if (revision === consentRevision) enabled = stored === 'true';
  ready = true;
  if (enabled) {
    flush();
    replayIdentify();
  } else {
    // Consent resolved to "not granted" → discard the speculative pre-consent
    // buffer so it can't be replayed on a later opt-in (consent invariant).
    queue.length = 0;
    pendingIdentify = undefined;
  }
  return enabled;
}

/** Persist + apply the analytics consent decision (Settings toggle / onboarding). */
export async function setAnalyticsEnabled(on: boolean) {
  consentRevision++;
  enabled = on;
  ready = true;
  try {
    await AsyncStorage.setItem(CONSENT_KEY, on ? 'true' : 'false');
  } catch {
    /* best-effort persist */
  }
  if (on) {
    flush();
    replayIdentify();
  } else {
    queue.length = 0; // revoked → drop anything buffered, stop sending
    pendingIdentify = undefined;
  }
}

/** Onboarding grants analytics once. A prior explicit Settings opt-out wins. */
export async function enableOnboardingAnalytics() {
  const revision = consentRevision;
  const stored = await AsyncStorage.getItem(CONSENT_KEY);
  if (revision !== consentRevision || stored === 'false') return;
  await setAnalyticsEnabled(true);
}

export function analyticsEnabled() {
  return enabled;
}

/** Associate subsequent events with the signed-in user (Supabase user.id). */
export function identify(userId: string, set?: Props) {
  distinctId = userId;
  identified = true;
  if (enabled) post('$identify', {}, set);
  else pendingIdentify = set ?? {}; // send the person-props merge once consent lands
}

/** On sign-out: stop attributing to the user, fall back to the persisted anon id. */
export function reset() {
  distinctId = anonId;
  identified = false;
  pendingIdentify = undefined;
}

function replayIdentify() {
  if (enabled && identified && pendingIdentify !== undefined) {
    post('$identify', {}, pendingIdentify);
    pendingIdentify = undefined;
  }
}

function post(event: string, props: Props, set?: Props) {
  if (!config.posthogKey) return;
  const body = {
    api_key: config.posthogKey,
    event,
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    properties: {
      ...props,
      ...(set ? { $set: set } : {}),
      $lib: 'heydpe-mobile',
      platform: Platform.OS,
    },
  };
  // Fire-and-forget; never let telemetry throw into the app.
  fetch(`${config.posthogHost}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

function flush() {
  if (!enabled || !config.posthogKey) return;
  const pending = queue.splice(0, queue.length);
  for (const e of pending) post(e.event, e.props);
}

export function track(event: string, props: Props = {}) {
  if (__DEV__) {
    console.log(`[track${enabled ? '' : ready ? ':no-consent' : ':queued'}] ${event}`, props);
  }
  // Consent loads async at startup; briefly buffer events until it resolves, then
  // they're either flushed (consent granted) or dropped (loadAnalyticsConsent).
  if (!ready) {
    queue.push({ event, props });
    return;
  }
  if (enabled) post(event, props);
}
