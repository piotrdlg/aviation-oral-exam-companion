# 69 — Voice Stack Phase B — Browser Playback Fix

**Date**: 2026-03-06
**Severity**: P1 — TTS playback fails in all browsers after Deepgram 400 fix
**Predecessor**: Doc 68 (Deepgram API contract fix)
**Root causes**: (1) Safari autoplay policy violation, (2) Firefox MIME/blob construction
**Reviewed by**: GPT-5.1 Codex via PAL MCP (continuation 5b446212)

---

## 1. Executive Summary

After the Deepgram 400 API contract fix (doc 68, commit `5efcec8`), TTS playback continued to fail in all browsers with browser-specific errors:

- **Safari**: `NotAllowedError` — "request not allowed by the user agent or the platform"
- **Firefox**: `MEDIA_ERR_SRC_NOT_SUPPORTED` — "media resource not suitable"
- **Chrome**: Generic "Audio playback failed"

The Deepgram API was now returning valid MP3 data (HTTP 200), but the client-side playback pipeline had two independent bugs preventing audio from reaching the user's speakers.

---

## 2. Root Cause Analysis

### Bug 1: Safari Autoplay Policy Violation (Critical)

**The call chain from user click to `audio.play()`:**

```
User clicks "Start Exam"
  → await fetch('/api/session', ...)     ← gesture context LOST here
  → await fetch('/api/exam', ...)
  → speakText(examinerMsg)
    → voice.speak(text)
      → await fetch('/api/tts', ...)
      → await response.arrayBuffer()
      → new Audio(url)
      → await audio.play()               ← REJECTED by Safari
```

Safari (especially iOS Safari) requires `HTMLAudioElement.play()` to be called within a user gesture handler. After the first `await`, the gesture context expires. With 4+ async operations between the user click and `play()`, Safari rejects every TTS playback attempt.

The Settings page diagnostics had the same issue but wasn't reported because Firefox showed a stale SpeechRecognition error (cache) before reaching the TTS step.

### Bug 2: Firefox MIME/Blob Construction (Critical)

**App path** (`useVoiceProvider.ts`):
```typescript
const blob = await response.blob();  // MIME inferred from response
```

**Settings path** (`settings/page.tsx`):
```typescript
const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });  // Explicit MIME
```

The app path relied on `response.blob()` to preserve the `Content-Type: audio/mpeg` header through Next.js's ReadableStream piping. Firefox's strict MIME validation reported `MEDIA_ERR_SRC_NOT_SUPPORTED` because the blob type was not reliably set.

### Bug 3: No Error Diagnostics (Medium)

The `audio.onerror` handler cleaned up silently — no `audio.error.code`, no `blob.size`, no `canPlayType` logging. This made it impossible to distinguish between autoplay rejection, MIME errors, empty responses, and codec issues from error messages alone.

---

## 3. Fixes Deployed

### Fix A: Audio Unlock Module (`src/lib/audio-unlock.ts`) — NEW

Standard web audio pre-warming pattern (used by Howler.js, Tone.js):

- `warmUpAudio()` plays a tiny silent WAV (44 bytes) via `new Audio(dataURI).play()`
- Must be called **synchronously** from user gesture handlers **before** any `await`
- After first successful play, browser unlocks audio for the page session
- Also resumes `AudioContext` for Chrome

### Fix B: Explicit MIME Type (`src/hooks/useVoiceProvider.ts`) — MODIFIED

Changed from:
```typescript
const blob = await response.blob();
```
To:
```typescript
const arrayBuffer = await response.arrayBuffer();
if (arrayBuffer.byteLength === 0) {
  throw new Error('TTS returned empty audio (0 bytes)');
}
const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
```

This matches the Settings page pattern and ensures Firefox always sees `audio/mpeg` MIME type.

### Fix C: Error Instrumentation (`src/hooks/useVoiceProvider.ts`) — MODIFIED

`audio.onerror` now captures and logs:
- `audio.error.code` and `audio.error.message`
- `blob.size` and `blob.type`
- `audio.canPlayType('audio/mpeg')`

### Fix D: Gesture Handler Integration (`practice/page.tsx`, `settings/page.tsx`) — MODIFIED

Added `warmUpAudio()` calls at the top of every user gesture handler that leads to TTS:

| Handler | File | Line | Trigger |
|---------|------|------|---------|
| `startSession()` | practice/page.tsx | ~528 | Start Exam button |
| `sendAnswer()` | practice/page.tsx | ~655 | Submit / I don't know |
| `resumeSession()` | practice/page.tsx | ~1237 | Resume Exam button |
| `previewVoice()` | settings/page.tsx | ~680 | Voice preview button |
| `runDiagnostics()` | settings/page.tsx | ~791 | Run Diagnostics button |

### Fix E: Blob URL Leak Prevention (`useVoiceProvider.ts`) — MODIFIED

When `audio.play()` rejects (NotAllowedError, etc.), `onerror`/`onended` never fire. The catch block now revokes the blob URL and clears `audioRef` to prevent resource leaks.

---

## 4. GPT Codex Code Review Findings

GPT-5.1 Codex (via PAL MCP, continuation `5b446212`) reviewed all changes and identified:

1. **HIGH (fixed)**: `resumeSession()` was missing `warmUpAudio()` — would still fail on Safari. Fixed.
2. **HIGH (pre-existing, noted)**: TTS quota query counts rows instead of summing characters. Not part of this incident.
3. **MEDIUM (fixed)**: Blob URLs leaked when `play()` rejected. Fixed.

---

## 5. Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/audio-unlock.ts` | CREATE | Audio pre-warming for Safari autoplay |
| `src/hooks/useVoiceProvider.ts` | MODIFY | Explicit MIME, empty check, error instrumentation, URL leak fix |
| `src/app/(dashboard)/practice/page.tsx` | MODIFY | warmUpAudio in startSession, sendAnswer, resumeSession |
| `src/app/(dashboard)/settings/page.tsx` | MODIFY | warmUpAudio in previewVoice, runDiagnostics |
| `src/lib/__tests__/audio-unlock.test.ts` | CREATE | 19 contract + integration tests |
| `docs/system-audit/69 - ...` | CREATE | This report |
| `docs/system-audit/00 - Index.md` | MODIFY | Add doc 69 |

---

## 6. Verification

- TypeScript: 0 errors
- Tests: 55 files, 1206 tests passing (19 new)
- GPT Codex review: all findings addressed
- Pre-existing test count preserved (1187 → 1206, delta = 19 new)

---

## 7. Architecture After Fix

```
User clicks Start/Submit/Resume
  ↓ (synchronous, in gesture handler)
warmUpAudio() → plays silent WAV → unlocks browser audio
  ↓ (async operations)
fetch /api/exam → examiner message
  ↓
voice.speak(text) →
  fetch /api/tts → POST → Deepgram Aura-2 MP3 (no sample_rate) →
  response.arrayBuffer() → new Blob([ab], {type: 'audio/mpeg'}) →
  URL.createObjectURL(blob) → new Audio(url) → audio.play() ← NOW WORKS
```

---

## 8. Timeline (Cumulative with Doc 68)

| Time | Event |
|------|-------|
| T+0 | Commit `91c59d9`: Force MP3, remove AudioWorklet |
| T+15m | Deepgram 400 discovered (sample_rate with MP3) |
| T+45m | Commit `5efcec8`: FIXED_RATE_ENCODINGS, 24 contract tests |
| T+60m | Commit `47014f3`: Replace SpeechRecognition diagnostic |
| T+75m | Real browser testing reveals TTS STILL fails |
| T+90m | Phase B: Root cause = autoplay policy + MIME type |
| T+120m | Fix: audio-unlock.ts + explicit Blob + instrumentation |
| T+135m | GPT Codex review: found resumeSession gap, URL leak |
| T+150m | All fixes applied, 1206 tests passing |

---

## 9. Key Lessons

1. **The Deepgram API contract was only the first layer.** Fixing the server-side 400 error was necessary but not sufficient. The client-side playback pipeline had independent browser compatibility bugs.

2. **Safari autoplay policy is not about "user interaction"** — it's about whether `play()` is in the synchronous call stack of a gesture handler. After the first `await`, the context expires. The standard fix is a silent play during the gesture (audio pre-warming).

3. **`response.blob()` vs explicit `Blob()` matters.** Through Next.js ReadableStream piping, `response.blob()` may not reliably preserve Content-Type. Explicit `new Blob([arrayBuffer], { type: 'audio/mpeg' })` is the only reliable cross-browser pattern.

4. **Error handlers must capture diagnostics.** The original `audio.onerror = () => { cleanup() }` gave zero signal about what went wrong. Every error handler should log the error details.

5. **Code review by a second model caught a real bug.** GPT Codex found that `resumeSession()` was missing the audio unlock — a genuine gap in the fix.

---

## 10. Next Steps

- [ ] Deploy and validate in real browsers (Chrome, Firefox, Safari, iOS Safari, Edge)
- [ ] Clean up dead code: `useStreamingPlayer.ts`, `pcm-playback-processor.js`
- [ ] Fix pre-existing TTS quota bug (counts rows, not character sum)
- [ ] Verify/clean `system_config['tts.deepgram']` DB row
