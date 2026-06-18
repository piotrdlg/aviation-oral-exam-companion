/**
 * Telemetry shim. The native PostHog/Sentry providers land in the telemetry
 * phase (consent-gated init); until then track() is a dev-only console sink so
 * event call sites (onboarding funnel, exam loop, paywall) are correct now and
 * light up the moment the real provider is wired behind the analytics consent.
 *
 * No PII ever — pass booleans/enums (e.g. hasDisplayName), never raw values.
 */
type Props = Record<string, string | number | boolean | null | undefined>;

let enabled = false;

/** Flip on once the user has consented to analytics (telemetry phase wires this). */
export function setAnalyticsEnabled(on: boolean) {
  enabled = on;
}

export function track(event: string, props: Props = {}) {
  // Until the real provider lands, only surface in dev to validate call sites.
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[track${enabled ? '' : ':pending-consent'}] ${event}`, props);
  }
  // TODO(telemetry phase): if (enabled) posthog.capture(event, props)
}
