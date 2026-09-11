import type { ErrorEvent } from '@sentry/react-native';

let allowed = false;
let revision = 0;
let sdk: typeof import('@sentry/react-native') | undefined;

/** Retain stack locations and error types, but never exception payloads or requests. */
export function scrubCrash(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    level: event.level,
    exception: event.exception ? { values: event.exception.values?.map((entry) => ({
      type: entry.type,
      value: 'Application error (message omitted for privacy)',
      stacktrace: entry.stacktrace ? { frames: entry.stacktrace.frames?.map((frame) => ({
        filename: frame.filename?.split('?')[0],
        function: frame.function,
        lineno: frame.lineno,
        colno: frame.colno,
        in_app: frame.in_app,
      })) } : undefined,
    })) } : undefined,
  };
}

export async function setCrashReportingEnabled(enabled: boolean) {
  allowed = enabled;
  const mine = ++revision;
  if (!enabled) { await sdk?.close(); return; }
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const sentry = await import('@sentry/react-native');
  if (mine !== revision || !allowed) return;
  sdk = sentry;
  sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: false,
    beforeSend: (event) => allowed ? scrubCrash(event) : null,
    beforeBreadcrumb: () => null,
  });
}
