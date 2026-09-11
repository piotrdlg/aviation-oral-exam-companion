import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

// Only whole, developer-owned diagnostics can become messages. Unknown text is
// never regex-redacted and forwarded: it may be an answer, token or user name.
const SAFE_MESSAGES = new Set([
  'connect_timeout', 'stt_pcm_invalid', 'Keychain unavailable',
  'Voice input is unavailable (stt_pcm_invalid). You can continue with text.',
  'Network request failed', 'Failed to fetch',
  'Voice connection timed out. Tap the mic to retry.',
  'Voice input dropped. Tap the mic to retry.',
  'Examiner audio is unavailable. You can continue with text.',
  'Examiner audio timed out. You can continue with text.',
  'Examiner audio stopped unexpectedly. You can continue with text.',
  'The request timed out. Check your connection.',
  'startup_probe',
]);
const SAFE_TYPES = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'ApiError', 'AbortError']);
export function safeCrashMessage(message?: string): string {
  if (message && (SAFE_MESSAGES.has(message) || /^Request failed \([45]\d{2}\)$/.test(message))) return message;
  return 'Unexpected application failure';
}
const sourceFile = (path?: string) => path?.split(/[?#]/)[0].split('/').at(-1);
const symbol = (name?: string) => name && /^[\w.$<> -]{1,120}$/.test(name) ? name : undefined;

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category !== 'heydpe.diagnostic') return null;
  const stage = crumb.data?.stage;
  if (typeof stage !== 'string' || !['startup', 'auth', 'api', 'stt', 'tts', 'storage'].includes(stage)) return null;
  return { category: 'heydpe.diagnostic', timestamp: crumb.timestamp, level: 'error',
    message: safeCrashMessage(crumb.message), data: { stage } };
}

/** Explicit event allowlist: no identity, request, context, attachments, or exam data. */
export function scrubCrash(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined, event_id: event.event_id, timestamp: event.timestamp,
    platform: event.platform, release: event.release, dist: event.dist,
    environment: event.environment, level: event.level,
    // Required for Hermes debug-ID source-map matching. Paths become basenames.
    debug_meta: event.debug_meta ? { images: event.debug_meta.images?.flatMap((entry) => entry.type === 'sourcemap' ? [{
      type: 'sourcemap' as const, debug_id: entry.debug_id, code_file: sourceFile(entry.code_file) ?? '',
    }] : []) } : undefined,
    breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null),
    exception: event.exception ? { values: event.exception.values?.map((entry) => ({
      type: SAFE_TYPES.has(entry.type ?? '') ? entry.type : 'Error',
      value: safeCrashMessage(entry.value),
      mechanism: entry.mechanism ? { type: 'generic', handled: entry.mechanism.handled } : undefined,
      stacktrace: entry.stacktrace ? { frames: entry.stacktrace.frames?.map((frame) => ({
        filename: sourceFile(frame.filename), function: symbol(frame.function),
        lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) } : undefined,
    })) } : undefined,
  };
}

// Loaded by index.js BEFORE Expo Router or application modules. iOS native SDK
// starts even earlier in AppDelegate via with-anonymous-sentry.cjs.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  // Android native capture stays disabled until its equivalent scrubber ships.
  enableNative: Platform.OS === 'ios',
  autoInitializeNativeSdk: false,
  sendDefaultPii: false, tracesSampleRate: 0,
  enableAutoSessionTracking: false, enableAutoPerformanceTracing: false,
  enableAppStartTracking: false, enableNativeFramesTracking: false,
  enableStallTracking: false, enableLogs: false,
  attachScreenshot: false, attachViewHierarchy: false,
  beforeSend: scrubCrash, beforeBreadcrumb: scrubBreadcrumb,
});

export function captureDiagnostic(stage: 'startup' | 'auth' | 'api' | 'stt' | 'tts' | 'storage', error: Error) {
  const message = safeCrashMessage(error.message);
  Sentry.addBreadcrumb({ category: 'heydpe.diagnostic', message, data: { stage } });
  Sentry.captureException(error); // beforeSend keeps the stack and replaces unsafe text.
}
