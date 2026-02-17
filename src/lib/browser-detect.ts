/**
 * Browser capability detection utility.
 *
 * Pure functions that examine the user-agent and browser APIs to determine
 * audio capabilities. Used to select appropriate voice providers and handle
 * browser-specific quirks.
 */

export interface BrowserCapabilities {
  /** Browser supports AudioWorklet API (needed for Tier 2/3 streaming) */
  supportsAudioWorklet: boolean;
  /** Browser supports MediaRecorder API */
  supportsMediaRecorder: boolean;
  /** Best MIME type for MediaRecorder (webm preferred, mp4 fallback for Safari) */
  mediaRecorderMimeType: string;
  /** Running on iOS Safari (not CriOS/FxiOS/EdgiOS) */
  isIOSSafari: boolean;
  /** Running on iOS Chrome (CriOS) */
  isIOSChrome: boolean;
  /** Running on any iOS browser */
  isIOS: boolean;
  /** Browser requires user gesture before playing audio */
  requiresUserGestureForAudio: boolean;
  /** Browser supports Web Speech API (SpeechRecognition) */
  supportsSpeechRecognition: boolean;
}

/**
 * Parse a user-agent string to detect iOS and browser type.
 * This is a pure function — no DOM/window access needed — so it's fully testable.
 */
export function parseUserAgent(ua: string): {
  isIOS: boolean;
  isIOSSafari: boolean;
  isIOSChrome: boolean;
  isIOSFirefox: boolean;
  isIOSEdge: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
} {
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));

  // On iOS, non-Safari browsers embed their identifier but still use WebKit:
  // CriOS = Chrome on iOS, FxiOS = Firefox on iOS, EdgiOS = Edge on iOS
  const isIOSChrome = isIOS && /CriOS/.test(ua);
  const isIOSFirefox = isIOS && /FxiOS/.test(ua);
  const isIOSEdge = isIOS && /EdgiOS/.test(ua);

  // iOS Safari is iOS without any of the third-party browser identifiers
  const isIOSSafari = isIOS && !isIOSChrome && !isIOSFirefox && !isIOSEdge && /Safari/.test(ua);

  // Desktop Safari: has Safari in UA but NOT Chrome/Chromium/Edge/Firefox
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua) && !/Edge/.test(ua) && !/Firefox/.test(ua);

  const isChrome = /Chrome/.test(ua) && !/Edge/.test(ua) && !/Chromium/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  return {
    isIOS,
    isIOSSafari,
    isIOSChrome,
    isIOSFirefox,
    isIOSEdge,
    isSafari,
    isChrome,
    isFirefox,
  };
}

/**
 * Detect browser capabilities by probing the runtime environment.
 * Must be called in a browser context (client-side only).
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    // Server-side: return conservative defaults
    return {
      supportsAudioWorklet: false,
      supportsMediaRecorder: false,
      mediaRecorderMimeType: 'audio/webm;codecs=opus',
      isIOSSafari: false,
      isIOSChrome: false,
      isIOS: false,
      requiresUserGestureForAudio: false,
      supportsSpeechRecognition: false,
    };
  }

  const ua = navigator.userAgent;
  const parsed = parseUserAgent(ua);

  // AudioWorklet detection
  const supportsAudioWorklet =
    typeof AudioContext !== 'undefined' &&
    'audioWorklet' in AudioContext.prototype;

  // MediaRecorder detection
  const supportsMediaRecorder = typeof MediaRecorder !== 'undefined';

  // MediaRecorder MIME type: prefer webm/opus (Chrome/Firefox), fallback to mp4 (Safari)
  let mediaRecorderMimeType = 'audio/webm;codecs=opus';
  if (supportsMediaRecorder) {
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mediaRecorderMimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mediaRecorderMimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mediaRecorderMimeType = 'audio/webm';
      }
    }
  }

  // iOS and Safari require a user gesture to start audio playback
  const requiresUserGestureForAudio = parsed.isIOS || parsed.isSafari || parsed.isIOSSafari;

  // Web Speech API (SpeechRecognition) — only Chrome and Edge support it natively
  const supportsSpeechRecognition =
    typeof window !== 'undefined' &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  return {
    supportsAudioWorklet,
    supportsMediaRecorder,
    mediaRecorderMimeType,
    isIOSSafari: parsed.isIOSSafari,
    isIOSChrome: parsed.isIOSChrome,
    isIOS: parsed.isIOS,
    requiresUserGestureForAudio,
    supportsSpeechRecognition,
  };
}
