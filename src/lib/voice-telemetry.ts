'use client';

/**
 * Client-side voice telemetry — sanitized PostHog events for STT/TTS diagnostics.
 *
 * All events are prefixed with `stt_` or `voice_` for easy filtering.
 * No transcript text, tokens, or sensitive payloads are ever included.
 */

import posthog from 'posthog-js';

export function getBrowserInfo(): Record<string, string> {
  if (typeof navigator === 'undefined') return {};
  const ua = navigator.userAgent;
  let browser = 'unknown';
  if (/CriOS/.test(ua)) browser = 'ios_chrome';
  else if (/FxiOS/.test(ua)) browser = 'ios_firefox';
  else if (/EdgiOS/.test(ua)) browser = 'ios_edge';
  else if (/iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'ios_safari';
  else if (/Firefox/.test(ua)) browser = 'firefox';
  else if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Chrome/.test(ua)) browser = 'chrome';
  else if (/Safari/.test(ua)) browser = 'safari';

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  return {
    browser,
    platform: isIOS ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'macos' : /Win/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'other',
  };
}

/**
 * Capture a voice telemetry event. No-op if PostHog is not initialized or consent not given.
 */
export function captureVoiceEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (!posthog || typeof posthog.capture !== 'function') return;
    posthog.capture(event, {
      ...getBrowserInfo(),
      ...properties,
    });
  } catch {
    // Silent — telemetry must never break the app
  }
}
