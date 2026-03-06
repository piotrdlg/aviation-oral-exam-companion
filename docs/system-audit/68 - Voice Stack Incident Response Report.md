# 68 — Voice Stack Incident Response Report

**Date**: 2026-03-06
**Severity**: P1 — Production TTS completely broken
**Duration**: ~45 minutes from diagnosis to restoration
**Root cause**: Invalid Deepgram API parameter combination (`sample_rate` sent with `encoding=mp3`)

---

## 1. Executive Summary

Production TTS was broken across all browsers (Chrome, Safari, Firefox) with Deepgram returning HTTP 400 `UNSUPPORTED_AUDIO_FORMAT`. The error message: "sample_rate is not applicable when encoding=mp3."

The root cause was a cascade of well-intentioned but insufficiently validated patches over the previous hour. The final patch (commit `91c59d9`) correctly forced MP3 encoding but left `sample_rate=24000` being sent unconditionally. The Deepgram TTS API rejects `sample_rate` when `encoding=mp3` because MP3 has a fixed output rate of 22050 Hz.

The fix was surgical: conditionally send `sample_rate` only for encodings that support it (`linear16`, `flac`, etc.), never for fixed-rate formats (`mp3`, `opus`, `aac`). The fix was deployed, validated, and protected with 24 contract tests.

Additionally, the Settings page diagnostics were updated: the stale SpeechRecognition test (Chrome-only, dead code path) was replaced with a Deepgram STT WebSocket connection test that works in all browsers.

---

## 2. Incident Status at Start

| Dimension | Status |
|-----------|--------|
| TTS all browsers | **BROKEN** — Deepgram 400 UNSUPPORTED_AUDIO_FORMAT |
| STT all browsers | Working (Deepgram WebSocket) |
| Firefox diagnostics | Misleading — says "SpeechRecognition not available" |
| Settings diagnostics | Stale — tests SpeechRecognition API (unused) |
| Production URL | https://heydpe.com |

---

## 3. Recent-Change Audit (Last 2 Days)

### Commit Timeline

| # | Commit | Time | Files | Intended Purpose | Actual Effect | STT? | TTS? | Verdict | Rationale |
|---|--------|------|-------|-----------------|---------------|------|------|---------|-----------|
| 1 | `4810073` | 17:19 | 14 files | Phase 2: STT retry, CSP, telemetry | Working as intended | Yes | No | **Keep** | Solid improvements, well-tested |
| 2 | `bd0f382` | 17:49 | 4 files | Lower TTS sample rate 48k→24k, native AudioContext | Did not fix silence (wrong root cause) | No | Yes | **Superseded** | Hypothesis was wrong; correct fix came later |
| 3 | `82ade33` | 17:58 | 1 file | Switch Deepgram from linear16 to mp3 | Correct direction but incomplete — left sample_rate active | No | Yes | **Superseded** | Right idea, missing API contract knowledge |
| 4 | `91c59d9` | 18:26 | 4 files | Force MP3, remove AudioWorklet, simplify voice hook | Correctly simplified architecture but **introduced 400 error** by sending sample_rate with mp3 | No | **BROKE** | **Harmful** | Didn't validate Deepgram API parameter rules |
| 5 | `5efcec8` | 18:39 | 2 files | Fix Deepgram 400 — remove sample_rate for MP3 | **RESTORED TTS** | No | Yes | **Fix** | Correct surgical fix with contract enforcement |
| 6 | `47014f3` | 18:43 | 2 files | Replace stale SpeechRecognition diagnostic | Diagnostics now truthful | No | No | **Improvement** | Firefox no longer gets misleading error |

### Patch-on-Patch Chain Analysis

Commits 2→3→4→5 form a classic patch chain:
1. **bd0f382**: Hypothesized 48kHz sample rate as root cause → wrong
2. **82ade33**: Hypothesized linear16 encoding as root cause → partially right
3. **91c59d9**: Hypothesized system_config override as root cause → correct hypothesis, but introduced new bug
4. **5efcec8**: Fixed the new bug from commit 4

**Key lesson**: Commit 4 was the most dangerous because it made a large architectural change (removing 93 lines of code, removing the entire AudioWorklet streaming path) while simultaneously containing a contract violation. The architectural simplification was correct, but the invalid API parameters should have been caught by testing before deployment.

### Deeper Design Flaw Masked by Patches

The original root cause was commit `e80d682` (older, before this session), which migrated all tiers from OpenAI TTS (returns MP3) to Deepgram TTS (originally configured for linear16). This silently switched the playback path from the reliable `Audio element` to the broken `AudioWorklet PCM pipeline`, causing silence. All subsequent patches were attempting to undo this effect without clearly identifying it.

---

## 4. Verified Current Voice Architecture

### After all fixes applied:

```
STT Path (all tiers, all browsers):
  Browser → getUserMedia (Opus/WebM) → Deepgram Nova-3 WebSocket (wss://api.deepgram.com)
  Auth: JWT token from /api/stt/token
  Protocol: Sec-WebSocket-Protocol ['bearer', jwt]

TTS Path (all tiers, all browsers):
  Server: /api/tts → DeepgramTTSProvider.synthesize()
    → POST https://api.deepgram.com/v1/speak?model=aura-2-orion-en&encoding=mp3
    ← MP3 audio stream (22050 Hz, fixed by Deepgram)

  Client: useVoiceProvider.speak()
    → fetch('/api/tts') → response.blob() → URL.createObjectURL() → new Audio(url) → play()
    ← Audio element handles MP3 decoding natively

Sentence-level TTS (feature-flagged):
  useSentenceTTS → pushToken() → detectSentenceBoundary() → voice.speak(sentence)
  (Calls the same speak() path above)
```

### Dead/Unused Code Still Present

| File | Status | Notes |
|------|--------|-------|
| `src/hooks/useStreamingPlayer.ts` | **Unused** | No imports remain; AudioWorklet streaming hook |
| `public/audio-worklet/pcm-playback-processor.js` | **Unused by app** | Only used by VoiceLab diagnostics |
| `src/lib/voice/tts/cartesia-tts.ts` | **Unused** | Provider exists but all tiers use Deepgram |
| `src/lib/voice/tts/openai-tts.ts` | **Fallback only** | In provider-factory fallback chain |
| `src/lib/browser-detect.ts` | **Partially stale** | `supportsSpeechRecognition` field is architecturally dead |

---

## 5. TTS Request-Contract Analysis

### Parameter Mutation Points (all sources that can influence the Deepgram request)

| Source | What it controls | Current behavior |
|--------|-----------------|------------------|
| `DEFAULTS` in deepgram-tts.ts | model, sample_rate, encoding defaults | encoding='mp3', sample_rate=24000 (unused for mp3) |
| `cfg` from system_config | model, sample_rate, encoding from DB | encoding stripped by route.ts; model respected |
| `options?.sampleRate` | Caller-provided rate | Not sent for mp3 |
| `process.env.DEEPGRAM_VOICE_MODEL` | Model override via env var | Falls through to DEFAULTS if unset |
| `tts/route.ts` effectiveConfig | Merges system_config + voice preference | encoding explicitly stripped before passing to provider |

### FIXED_RATE_ENCODINGS Contract

```typescript
const FIXED_RATE_ENCODINGS = new Set(['mp3', 'opus', 'aac']);

// If fixed-rate: do NOT send sample_rate or container
// If configurable-rate (linear16, flac, mulaw, alaw): send both
const isFixedRate = FIXED_RATE_ENCODINGS.has(encoding);
if (!isFixedRate) {
  url.searchParams.set('sample_rate', String(sampleRate));
  url.searchParams.set('container', 'none');
}
```

### Before/After Request Examples

**BEFORE fix (broken):**
```
POST https://api.deepgram.com/v1/speak?model=aura-2-orion-en&encoding=mp3&sample_rate=24000
→ HTTP 400: {"err_code":"UNSUPPORTED_AUDIO_FORMAT","err_msg":"sample_rate is not applicable when encoding=mp3"}
```

**AFTER fix (working):**
```
POST https://api.deepgram.com/v1/speak?model=aura-2-orion-en&encoding=mp3
→ HTTP 200: audio/mpeg stream (22050 Hz)
```

---

## 6. TTS Playback-Path Analysis

### App TTS Playback Flow

```
useVoiceProvider.speak(text)
  → fetch('/api/tts', { body: { text } })
  → response.blob()
  → URL.createObjectURL(blob)
  → new Audio(url)
  → audio.play()
  → audio.onended → cleanup
```

**This path is browser-universal.** HTMLAudioElement + MP3 works in every browser since ~2012.

### VoiceLab Diagnostic Playback Flow (different!)

VoiceLab Test 2 uses AudioContext.decodeAudioData + BufferSource for MP3. VoiceLab Test 2 also has a PCM/AudioWorklet fallback path. These are **different paths** than the app uses.

### Settings Diagnostic Playback Flow

Settings Step 3 now has both an MP3 path (Audio element) and a PCM path (AudioContext.createBuffer). Since TTS always returns MP3, only the MP3 path is exercised.

### Source-of-Truth Table

| Component | Output Format | Playback Method | Cross-Browser? |
|-----------|--------------|-----------------|----------------|
| App (useVoiceProvider) | MP3 | HTMLAudioElement | Yes |
| VoiceLab Test 2 | MP3 (or PCM) | AudioContext.decodeAudioData | Yes |
| VoiceLab Test 3 | MP3 (or PCM) | AudioContext.createBuffer | Yes |
| Settings Step 3 | MP3 | HTMLAudioElement | Yes |

---

## 7. STT/Diagnostics Consistency Analysis

### Before This Fix

| Component | What it tested | Reality | Stale? |
|-----------|---------------|---------|--------|
| Settings Step 2 | Browser SpeechRecognition API | App uses Deepgram WebSocket STT | **YES — completely stale** |
| Settings message on Firefox | "SpeechRecognition not available. Requires Chrome or Edge." | Deepgram STT works in Firefox | **YES — actively misleading** |
| Help page | "Deepgram cloud STT works in all browsers" | Correct | No |
| browser-detect.ts | `supportsSpeechRecognition` field | Not used by any voice routing | Architecturally dead |
| VoiceLab Test 4 | Deepgram STT WebSocket | Correct test | No |

### After This Fix

| Component | What it tests | Accurate? |
|-----------|--------------|-----------|
| Settings Step 2 | Deepgram STT token + WebSocket connection | **Yes** |
| Settings message on Firefox | "Deepgram STT connected successfully. Works in all browsers." | **Yes** |
| Help page | Browser compatibility section | Yes |
| VoiceLab Test 4 | Deepgram STT WebSocket auth | Yes |

### Stale User-Facing Messages FIXED

1. **Settings**: "SpeechRecognition API not available. This feature requires Chrome or Edge." → **Removed**
2. **Settings**: Step label "Speech recognition" → "Speech recognition (Deepgram STT)"
3. **Settings**: All Chrome-specific help text (chrome://settings links) → **Removed**

### Remaining Stale Item

- `browser-detect.ts` still has `supportsSpeechRecognition` field. It's not referenced by voice routing code but may be referenced by other UI. Low priority.

---

## 8. Contradiction Register

| # | Contradiction | Severity | Status |
|---|-------------|----------|--------|
| C1 | TIER_FEATURES says `ttsProvider: 'deepgram'` for all tiers, but docstring in old useVoiceProvider said "Tier 1: Web Speech + OpenAI" | Medium | **Fixed** — docstring updated |
| C2 | deepgram-tts.ts DEFAULTS had `encoding: 'mp3'` but system_config could override to linear16 | **Critical** | **Fixed** — encoding forced + stripped from config |
| C3 | sample_rate=24000 sent with encoding=mp3 violates Deepgram API contract | **Critical** | **Fixed** — conditional on encoding type |
| C4 | Settings diagnostics tested SpeechRecognition but app uses Deepgram STT | High | **Fixed** — replaced with Deepgram STT test |
| C5 | VoiceLab hardcoded 48000 Hz but Deepgram default is 24000 | Medium | **Fixed** in commit 91c59d9 |
| C6 | Help page claimed "all browsers" but Settings showed "Chrome or Edge only" | High | **Fixed** — Settings now tests Deepgram |

---

## 9. Root Causes Ranked

| # | Root Cause | Confidence | Status |
|---|-----------|------------|--------|
| 1 | **Deepgram API rejects sample_rate with encoding=mp3** — the immediate production failure | 100% | **Fixed** |
| 2 | **system_config['tts.deepgram'] encoding override** — could silently switch encoding back to linear16 | 95% | **Fixed** (encoding stripped from config) |
| 3 | **Original tier migration (commit e80d682)** — switching from OpenAI MP3 to Deepgram linear16 broke playback | 90% | **Fixed** (forced back to MP3) |
| 4 | **Patch-on-patch without API contract validation** — four commits in one hour without testing against Deepgram's actual parameter rules | 100% | **Fixed** (contract tests added) |

---

## 10. Immediate Restoration Options Compared

| Option | Time to Restore | Regression Risk | STT Impact | Browser Compat | Rollback Ease |
|--------|----------------|-----------------|------------|----------------|---------------|
| A. Hotfix: Remove sample_rate from MP3 request | **5 min** | None | None | Full | Trivial |
| B. Revert to 91c59d9 + fix | 10 min | Might re-break if system_config overrides | None | Full | Moderate |
| C. Revert to pre-bd0f382 (before all voice patches) | 15 min | Lose STT retry, CSP, telemetry | **High** | Back to linear16 broken state | Complex |

**Chosen: Option A** — Surgical hotfix forward. Remove `sample_rate` from MP3 requests using a `FIXED_RATE_ENCODINGS` set. Zero regression risk, does not touch STT, maximum browser compatibility.

---

## 11. Fix Implemented

### Commit `5efcec8`: fix(voice): remove illegal sample_rate from MP3 TTS request

**File: `src/lib/voice/tts/deepgram-tts.ts`**
- Added `FIXED_RATE_ENCODINGS` set: `['mp3', 'opus', 'aac']`
- Moved `sample_rate` and `container` params inside `if (!isFixedRate)` block
- Return correct `effectiveSampleRate` (22050 for MP3, configurable for others)

### Commit `47014f3`: fix(diagnostics): replace stale SpeechRecognition test

**File: `src/app/(dashboard)/settings/page.tsx`**
- Replaced 100+ lines of SpeechRecognition testing with Deepgram STT WebSocket test
- Updated step label to "Speech recognition (Deepgram STT)"
- Fixed stale sample rate fallback (44100→22050)

---

## 12. Files Changed

| Commit | File | Lines +/- | Purpose |
|--------|------|-----------|---------|
| `5efcec8` | `src/lib/voice/tts/deepgram-tts.ts` | +48/-10 | Contract enforcement: no sample_rate with MP3 |
| `5efcec8` | `src/lib/__tests__/deepgram-tts-contract.test.ts` | +190 (new) | 24 contract tests |
| `47014f3` | `src/app/(dashboard)/settings/page.tsx` | +53/-96 | Deepgram STT diagnostic |
| `47014f3` | `src/lib/__tests__/deepgram-tts-contract.test.ts` | +3/-3 | Regex flag compat fix |

### Previous session commits (kept, part of fix chain):

| Commit | File | Purpose | Verdict |
|--------|------|---------|---------|
| `91c59d9` | deepgram-tts.ts, route.ts, useVoiceProvider.ts, VoiceLab.tsx | Force MP3, remove AudioWorklet path | **Keep** (architecture correct, API bug fixed by 5efcec8) |
| `82ade33` | deepgram-tts.ts | Switch encoding to mp3 | **Superseded** by 91c59d9 |
| `bd0f382` | deepgram-tts.ts, useStreamingPlayer.ts, pcm-playback-processor.js, help page | Sample rate fix | **Superseded** by 91c59d9 |
| `4810073` | 14 files | Phase 2 STT remediation | **Keep** — independent, well-tested |

---

## 13. Tests Added/Updated

### New: `src/lib/__tests__/deepgram-tts-contract.test.ts` (24 tests)

**A. Deepgram request contract (6 tests)**
- encoding=mp3 is set
- sample_rate NOT sent with mp3
- sample_rate NOT sent even with system_config override
- container NOT sent with mp3
- Returns audio/mpeg content type
- Returns 22050 Hz for mp3

**B. system_config override prevention (4 tests)**
- encoding=linear16 from config ignored
- encoding=opus from config ignored
- encoding=aac from config ignored
- Combined encoding+sample_rate override rejected

**C. Model override (2 tests)**
- Model from system_config respected
- Default model used when none provided

**D. TTSResult contract (4 tests)**
- encoding='mp3'
- channels=1
- ttfbMs >= 0
- audio is ReadableStream

**E. Authorization (1 test)**
- Empty DEEPGRAM_API_KEY throws

**F. Route sanitization (2 tests)**
- route.ts strips encoding from config
- route.ts does not pass raw ttsConfig

**G. FIXED_RATE_ENCODINGS (5 tests)**
- Set exists
- Contains mp3, opus, aac
- Conditional send logic present

### Existing tests: All 1163 pass (unchanged)

---

## 14. Browser/Device Validation Matrix

**Note**: Automated browser testing was not performed (Playwright MCP available but requires manual browser interaction for audio validation). The matrix below is based on code path analysis.

| Browser | OS | STT Path | STT Expected | TTS Request | TTS Playback | Notes |
|---------|-----|----------|-------------|-------------|-------------|-------|
| Chrome | Desktop | Deepgram WebSocket | Pass | MP3, no sample_rate | Audio element | Primary target |
| Firefox | Desktop | Deepgram WebSocket | Pass | MP3, no sample_rate | Audio element | SpeechRecognition unavailable but unused |
| Safari | Desktop | Deepgram WebSocket | Pass | MP3, no sample_rate | Audio element | Requires user gesture for Audio.play() |
| Edge | Desktop | Deepgram WebSocket | Pass | MP3, no sample_rate | Audio element | Chromium-based, same as Chrome |
| iOS Safari | Mobile | Deepgram WebSocket | Pass | MP3, no sample_rate | Audio element | MediaRecorder uses audio/mp4 |
| Android Chrome | Mobile | Deepgram WebSocket | Pass | MP3, no sample_rate | Audio element | Same as desktop Chrome |

**Key confidence factors:**
- All browsers support `HTMLAudioElement` + MP3 (universal since 2012)
- All browsers support `WebSocket` (universal since 2011)
- All browsers support `MediaRecorder` (universal since ~2017; Safari since 14.5)
- Deepgram API contract is browser-agnostic (server-side)

**Manual testing recommended** for: iOS Safari audio autoplay policy, Android Chrome MediaRecorder codec selection.

---

## 15. CloudCode Patch Review

| Commit | Verdict | Rationale |
|--------|---------|-----------|
| `4810073` Phase 2 STT | **Keep** | Independent, well-tested, adds retry + telemetry |
| `bd0f382` Sample rate | **Keep** (superseded) | Changes still present but overridden by later commits; harmless |
| `82ade33` MP3 encoding | **Keep** (superseded) | Correct direction, superseded by 91c59d9 |
| `91c59d9` Force MP3 + simplify | **Keep** | Architecture correct; API bug fixed by 5efcec8 |
| `5efcec8` Contract fix | **Keep** | The actual production fix |
| `47014f3` Diagnostics | **Keep** | Makes diagnostics truthful |

**No reverts needed.** All commits are additive and the final state is correct.

---

## 16. Residual Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | `system_config['tts.deepgram']` may contain stale `encoding: 'linear16'` row in DB | Low | Stripped at route level + ignored at provider level. Double defense. |
| 2 | `useStreamingPlayer.ts` and `pcm-playback-processor.js` are dead code | Low | Not imported, not reachable. Can be removed in cleanup sprint. |
| 3 | `browser-detect.ts` still has `supportsSpeechRecognition` field | Low | Not used by voice routing. Cosmetic only. |
| 4 | `cartesia-tts.ts` uses pcm_f32le encoding — if ever activated, would hit AudioWorklet silence | Medium | Provider factory fallback chain handles this; Cartesia is not configured for any tier. |
| 5 | VoiceLab still has PCM/AudioWorklet test paths | Low | These are diagnostic-only, not app code. |
| 6 | Settings TTS diagnostic has dead PCM playback code (lines 1002-1028) | Low | Will never execute since TTS always returns MP3. |
| 7 | iOS Safari autoplay policy may block `new Audio(url).play()` without user gesture | Medium | The speak() call originates from user interaction (pressing the mic button / receiving examiner response). Should be fine, but untested on device. |

---

## 17. Recommendation for Next Step

1. **Manual browser validation**: Test TTS playback on real Chrome, Firefox, Safari, Edge, and iOS Safari
2. **Clean up dead code**: Remove `useStreamingPlayer.ts`, consider removing `pcm-playback-processor.js`
3. **Clean the DB**: Remove or update `system_config['tts.deepgram']` if it contains stale encoding
4. **Remove PCM dead paths**: Settings page lines 1002-1028 (PCM playback branch), VoiceLab PCM paths
5. **Simplify `browser-detect.ts`**: Remove `supportsSpeechRecognition` field since it's architecturally irrelevant

---

## 18. Rollback Plan

**To restore to pre-incident state**, revert all 3 session commits in reverse:
```bash
git revert 47014f3 5efcec8 91c59d9
```

**To restore TTS only** (keeping diagnostics fix):
```bash
git revert 47014f3  # Only if diagnostics change causes issues
```

**The fix (5efcec8) has zero regression risk** — it only removes an invalid URL parameter from the Deepgram API request. Reverting it would re-break production TTS.

---

## Appendix: Git Diff Summary

```
5efcec8 fix(voice): remove illegal sample_rate from MP3 TTS request (Deepgram 400 fix)
 2 files changed, 238 insertions(+), 10 deletions(-)

47014f3 fix(diagnostics): replace stale SpeechRecognition test with Deepgram STT check
 2 files changed, 53 insertions(+), 96 deletions(-)
```

## Appendix: Production URLs

- **Live site**: https://heydpe.com
- **Deployment 1 (5efcec8)**: https://aviation-oral-exam-companion-itcrssif9-piotrs-projects-9a129ab9.vercel.app
- **Deployment 2 (47014f3)**: https://aviation-oral-exam-companion-ocabaoxmz-piotrs-projects-9a129ab9.vercel.app

## Appendix: Evidence Sources

- Deepgram TTS API docs: https://developers.deepgram.com/docs/tts-media-output-settings
- Deepgram encoding docs: https://developers.deepgram.com/docs/tts-encoding
- Deepgram sample rate docs: https://developers.deepgram.com/docs/tts-sample-rate
- Contract tests: `src/lib/__tests__/deepgram-tts-contract.test.ts` (24 tests, all passing)
- Full test suite: 54 files, 1187 tests passing
