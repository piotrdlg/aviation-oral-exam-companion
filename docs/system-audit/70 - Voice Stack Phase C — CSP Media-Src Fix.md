# 70 — Voice Stack Phase C — CSP Media-Src Fix

**Date**: 2026-03-06
**Severity**: P0 — TTS playback blocked by CSP in all browsers
**Predecessor**: Doc 69 (Browser playback fix — audio unlock + explicit MIME)
**Root cause**: CSP missing `media-src` directive; fallback to `default-src 'self'` blocked blob: and data: URLs
**Reviewed by**: GPT-5.1 Codex via PAL MCP (continuation e9ee9998)

---

## 1. Executive Summary

After the Phase B browser playback fix (doc 69, commit `547ffac`), TTS audio playback continued to fail in all browsers. The audio unlock module, explicit MIME construction, and Deepgram API integration were all functioning correctly — but the browser's Content Security Policy was silently rejecting the audio URLs before any application code could process them.

The root cause was a missing `media-src` CSP directive. Per the CSP specification, when `media-src` is absent, it falls back to `default-src 'self'`. Blob URLs (generated from TTS MP3 responses) and data: URIs (used by the audio-unlock silent WAV) are not `'self'`, so browsers blocked all audio playback at the security layer.

---

## 2. Root Cause Analysis

### The CSP Fallback Chain

```
CSP Header:
  default-src 'self'
  script-src  'self' 'unsafe-eval' ...
  style-src   'self' 'unsafe-inline' ...
  connect-src 'self' https://*.supabase.co wss://*.supabase.co ...
  img-src     'self' blob: data: ...
  media-src   ← NOT PRESENT
```

When `media-src` is absent, the browser applies the CSP fallback:
```
media-src (missing) → falls back to default-src → 'self'
```

This means:
- `blob:` URLs (from `URL.createObjectURL(new Blob([mp3Data], {type: 'audio/mpeg'}))`) — **BLOCKED**
- `data:` URIs (from `audio-unlock.ts` silent WAV: `data:audio/wav;base64,...`) — **BLOCKED**

Both the TTS playback path and the audio unlock pre-warming path were rejected by CSP before the audio decoder ever saw the data.

### Why Previous Fixes Were Invisible

All Phase A and Phase B fixes were correct:
- Phase A (commit `5efcec8`): Deepgram API contract fix — server returns valid MP3
- Phase B (commit `547ffac`): Audio unlock + explicit MIME — client constructs valid blob

But CSP operated at a layer **below** all application code. The browser's security policy intercepted the URL before `HTMLAudioElement` could attempt playback. This made every previous fix invisible — the audio data was valid, the MIME type was correct, the autoplay policy was satisfied, but the URL itself was forbidden.

---

## 3. Evidence from Browser Testing

Real browser testing via the admin TTS diagnostics page revealed the CSP block with browser-specific error signatures:

### Chrome
```
MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check
  error.code = 4
  canPlayType('audio/mpeg') = 'probably'
```

Chrome's error code 4 (`MEDIA_ERR_SRC_NOT_SUPPORTED`) combined with `canPlayType='probably'` is the signature of a CSP block — the codec is supported but the URL is rejected by security policy.

### Firefox
```
NotSupportedError: media resource not suitable
  canPlayType('audio/mpeg') = 'maybe'
```

Firefox reports CSP blocks as `NotSupportedError`, which is misleading — it suggests a codec issue when the actual problem is URL policy.

### Safari
```
NotSupportedError: The operation is not supported
  canPlayType('audio/mpeg') = 'maybe'
```

Safari uses the same generic `NotSupportedError`, providing no indication that CSP is the blocking layer.

### Server-Side Verification (All Browsers)

The server-side TTS pipeline worked perfectly in all three browsers:
- HTTP response: **200 OK**
- Response size: **40–46 KB** (valid MP3)
- MP3 magic bytes: `ff f3 64 c4` (confirmed valid MPEG audio frame header)

This confirmed the issue was purely client-side URL policy, not data integrity.

---

## 4. Fix Deployed

### CSP media-src Directive (`next.config.ts:21`)

Added the missing `media-src` directive to the Content Security Policy:

```typescript
// Before:
// (no media-src directive — falls back to default-src 'self')

// After:
"media-src 'self' blob: data:;"
```

This allows:
- `blob:` URLs — TTS MP3 audio playback via `URL.createObjectURL()`
- `data:` URIs — Audio unlock silent WAV via `new Audio('data:audio/wav;base64,...')`
- `'self'` — Any audio served from the same origin

### Admin TTS Diagnostics Page (`src/app/admin/tts-diagnostics/page.tsx`)

Created a 6-test diagnostics page that validates each layer of the TTS pipeline independently:

1. **API connectivity** — Can the client reach `/api/tts`?
2. **Response validity** — Does the API return HTTP 200 with valid MP3 data?
3. **Blob construction** — Can the browser create a blob URL from the MP3 data?
4. **CSP compliance** — Does the browser's security policy allow the blob URL?
5. **Audio decode** — Can the browser decode the MP3 audio?
6. **Playback** — Does audio actually play (audible output)?

This methodology of testing each layer independently was critical to isolating the CSP as the blocking layer.

---

## 5. GPT Codex Code Review Findings

GPT-5.1 Codex (via PAL MCP, continuation `e9ee9998`) reviewed all changes and identified:

1. **MEDIUM**: Diagnostics page TTS requests consume user quota — the diagnostics endpoint uses the same `/api/tts` route with rate limiting and quota tracking. Consider a separate admin endpoint or exemption for diagnostics.
2. **LOW**: `stopAudio()` does not revoke blob URL — when stopping audio playback, the blob URL created via `URL.createObjectURL()` is not revoked, causing a minor memory leak per playback.
3. **MEDIUM**: CSP test duplicates string — the new CSP regression tests duplicate the CSP string rather than importing it from the config, which could drift out of sync.

---

## 6. Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `next.config.ts` | MODIFY | Added `media-src 'self' blob: data:` to CSP |
| `src/app/admin/tts-diagnostics/page.tsx` | CREATE | 6-test TTS diagnostics page for layer-by-layer validation |
| `src/lib/__tests__/csp-config.test.ts` | MODIFY | 4 new media-src regression tests |
| `docs/system-audit/70 - ...` | CREATE | This report |
| `docs/system-audit/00 - Index.md` | MODIFY | Add doc 70 |

---

## 7. Verification

- TypeScript: 0 errors
- Tests: 55 files, 1210 tests passing (4 new)
- GPT Codex review: findings documented, no blockers
- Real browser validation: Chrome, Firefox, Safari — ALL 6 diagnostics tests PASS, audio audible

---

## 8. Architecture After Fix

```
User clicks Start/Submit/Resume
  ↓ (synchronous, in gesture handler)
warmUpAudio() → data: WAV → CSP media-src allows data: ✓ → browser audio unlocked
  ↓ (async operations)
fetch /api/tts → POST → TTS provider → HTTP 200 MP3
  ↓
response.arrayBuffer() → new Blob([ab], {type: 'audio/mpeg'})
  ↓
URL.createObjectURL(blob) → blob: URL → CSP media-src allows blob: ✓
  ↓
new Audio(blobUrl) → audio.play() ← NOW WORKS IN ALL BROWSERS
```

---

## 9. Timeline (Cumulative with Docs 68–69)

| Phase | Event | Commit |
|-------|-------|--------|
| Phase A | Deepgram API contract fix (FIXED_RATE_ENCODINGS, sample_rate removal) | `5efcec8` |
| Phase B | Audio unlock + explicit MIME + error instrumentation | `547ffac` |
| Phase C | CSP media-src fix + diagnostics page + regression tests | `13dacec` |

---

## 10. Key Lessons

1. **CSP blocks are invisible to application code.** The browser rejects the URL at the security layer before `HTMLAudioElement` sees it. Application-level error handlers receive generic errors (`MEDIA_ERR_SRC_NOT_SUPPORTED`, `NotSupportedError`) with no indication that CSP is the cause. The only reliable diagnostic is checking `canPlayType()` — if the codec is supported but the URL fails, CSP is likely blocking.

2. **Missing CSP directives fall back to `default-src`.** This is per specification but easy to overlook. The CSP had `img-src 'self' blob: data:` (allowing images from blob/data URLs) but no `media-src`, so audio was blocked even though images worked fine. Each resource type needs its own directive.

3. **Layer-by-layer diagnostics are essential.** The admin diagnostics page methodology — testing API, response, blob, CSP, decode, and playback independently — was the key to isolating the CSP layer. Without this approach, the CSP block was indistinguishable from codec errors, MIME errors, or autoplay policy violations.

4. **All three phases were necessary and cumulative.** Phase A fixed the server (Deepgram 400). Phase B fixed the client (autoplay + MIME). Phase C fixed the security policy (CSP). Each fix was correct but insufficient alone — the TTS pipeline required all three layers to be working simultaneously.

5. **Browser error messages for CSP audio blocks are misleading.** Chrome says "URL safety check" (closest to the truth). Firefox and Safari both say "not supported" — suggesting a codec or format issue when the actual problem is security policy. This misdirection cost significant debugging time.

---

## 11. Next Steps

- [ ] Address Codex finding: diagnostics page quota consumption (separate admin endpoint or exemption)
- [ ] Address Codex finding: blob URL revocation in `stopAudio()`
- [ ] Address Codex finding: CSP test string duplication (import from config)
- [ ] Clean up dead code: `useStreamingPlayer.ts`, `pcm-playback-processor.js`
- [ ] Fix pre-existing TTS quota bug (counts rows, not character sum)
