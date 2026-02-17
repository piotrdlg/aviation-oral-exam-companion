/**
 * Cross-browser voice integration utility.
 *
 * Uses browser detection to determine the best voice configuration for the
 * current browser environment. Handles fallback logic when AudioWorklet or
 * SpeechRecognition is unavailable.
 */

import { detectBrowserCapabilities, type BrowserCapabilities } from './browser-detect';
import type { VoiceTier } from './voice/types';

export interface VoiceConfig {
  /** Effective voice tier after any fallbacks */
  effectiveTier: VoiceTier;
  /** Whether voice mode is available in this browser */
  voiceAvailable: boolean;
  /** STT provider to use */
  sttProvider: 'browser' | 'deepgram' | 'none';
  /** TTS provider to use */
  ttsProvider: 'openai' | 'deepgram' | 'cartesia';
  /** Whether a user gesture is needed before audio playback */
  requiresUserGesture: boolean;
  /** Warning message for the user, if any */
  warning: string | null;
  /** Raw browser capabilities */
  capabilities: BrowserCapabilities;
}

/**
 * Determine the best voice configuration for the current browser and tier.
 *
 * Fallback rules:
 * - Tier 3 (dpe_live) requires AudioWorklet for streaming Cartesia audio.
 *   If AudioWorklet is unavailable, fall back to Tier 2 (Deepgram TTS which
 *   can serve MP3).
 * - Tier 1 (ground_school) requires Web Speech API for STT (Chrome only).
 *   If unavailable, STT is disabled but TTS still works.
 * - On iOS, all browsers require a user gesture before audio can play.
 */
export function getVoiceConfig(requestedTier: VoiceTier): VoiceConfig {
  const capabilities = detectBrowserCapabilities();
  let effectiveTier = requestedTier;
  let warning: string | null = null;

  // Tier 3 requires AudioWorklet for streaming PCM playback
  if (requestedTier === 'dpe_live' && !capabilities.supportsAudioWorklet) {
    effectiveTier = 'checkride_prep';
    warning = 'Your browser does not support AudioWorklet. Falling back to Checkride Prep voice tier.';
  }

  // Determine STT provider
  let sttProvider: 'browser' | 'deepgram' | 'none';
  if (effectiveTier === 'ground_school') {
    // Tier 1: Browser STT (Web Speech API, Chrome only)
    if (capabilities.supportsSpeechRecognition) {
      sttProvider = 'browser';
    } else {
      sttProvider = 'none';
      warning = warning || 'Speech recognition is not available in this browser. Voice input is disabled. Use Chrome for full voice support, or upgrade to Checkride Prep tier for cross-browser STT.';
    }
  } else {
    // Tier 2/3: Deepgram STT (all browsers)
    sttProvider = 'deepgram';
  }

  // Determine TTS provider based on effective tier
  const ttsProviderMap: Record<VoiceTier, 'openai' | 'deepgram' | 'cartesia'> = {
    ground_school: 'openai',
    checkride_prep: 'deepgram',
    dpe_live: 'cartesia',
  };
  const ttsProvider = ttsProviderMap[effectiveTier];

  // Voice mode is "available" if at least TTS works (user can always read answers + hear examiner)
  const voiceAvailable = true;

  // iOS user gesture requirement
  const requiresUserGesture = capabilities.requiresUserGestureForAudio;
  if (requiresUserGesture && !warning) {
    // Not an error, just informational — iOS users need to tap before audio plays
  }

  return {
    effectiveTier,
    voiceAvailable,
    sttProvider,
    ttsProvider,
    requiresUserGesture,
    warning,
    capabilities,
  };
}

/**
 * Resume AudioContext after a user gesture on iOS/Safari.
 * Call this from a click or tap handler to unlock audio playback.
 */
export async function unlockAudioContext(): Promise<void> {
  if (typeof AudioContext === 'undefined') return;

  const ctx = new AudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  // Create a silent buffer to fully unlock the audio pipeline
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  // Close after a brief delay to clean up
  setTimeout(() => ctx.close(), 100);
}
