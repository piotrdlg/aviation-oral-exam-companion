'use client';

/**
 * Audio unlock utility for Safari/iOS autoplay policy.
 *
 * Browsers (especially Safari, iOS Safari, and Chrome on Android)
 * require HTMLAudioElement.play() to originate from a user gesture.
 * When TTS playback happens after async operations (fetch exam API
 * → fetch TTS → blob), the gesture context has expired and play()
 * is rejected with NotAllowedError.
 *
 * Solution: call warmUpAudio() synchronously at the TOP of user
 * gesture handlers (onClick) BEFORE any async work. This plays a
 * tiny silent WAV to "unlock" audio for the page session. After
 * unlocking, programmatic play() calls work without gestures.
 *
 * This is the standard pattern used by Howler.js, Tone.js, and
 * other web audio libraries.
 */

let unlocked = false;

/**
 * Smallest valid WAV file: RIFF/WAVE, PCM, mono, 44100 Hz, 16-bit,
 * 1 sample of silence (44 bytes total).
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';

/**
 * Unlock browser audio playback for the current page session.
 *
 * MUST be called synchronously from a user gesture handler (onClick,
 * onTouchEnd) BEFORE any awaits. After the first successful call,
 * subsequent audio.play() calls work without gestures.
 *
 * Safe to call multiple times — only the first successful play matters.
 * Fails silently in SSR or unsupported environments.
 */
export function warmUpAudio(): void {
  if (unlocked || typeof window === 'undefined') return;

  try {
    // HTMLAudioElement unlock (Safari, iOS Safari)
    const audio = new Audio(SILENT_WAV);
    audio.volume = 0;
    const p = audio.play();
    if (p) {
      p.then(() => {
        unlocked = true;
        audio.pause();
        audio.removeAttribute('src');
        audio.load(); // Release resources
      }).catch(() => {
        // Gesture context expired or not valid — try again next time
      });
    }

    // AudioContext unlock (Chrome, Firefox)
    // Some browsers gate AudioContext separately from HTMLAudioElement
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => ctx.close()).catch(() => ctx.close());
      } else {
        ctx.close();
      }
    }
  } catch {
    // SSR or unsupported environment — ignore
  }
}

/** Whether audio playback has been unlocked for this session. */
export function isAudioUnlocked(): boolean {
  return unlocked;
}
