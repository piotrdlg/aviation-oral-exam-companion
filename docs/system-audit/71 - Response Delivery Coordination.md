# 71 — Response Delivery Coordination

> Restoring coordinated low-latency examiner response delivery in HeyDPE practice mode.

## 1. Context

HeyDPE is a voice-first AI oral exam simulator. When voice is enabled, the examiner's response must be delivered as synchronized text+audio. A 3-chunk structured response system was fully implemented but never activated due to a missing database feature flag and 4 latent client-side bugs.

## 2. Problem Statement

With voice enabled, examiner responses exhibited:
- Text appearing 500ms-2s before audio playback began
- Potential double-speaking if the 3-chunk path was ever activated
- No structured delivery — all text arrived as a single blob or paragraph-split chunks

The 3-chunk system (feedback_quick -> feedback_detail -> question) was designed to provide natural conversation pacing but remained dormant.

## 3. Architecture Discovery (Git Archaeology)

### 3.1 Response Delivery Paths

Three paths exist in the codebase:

| Path | Condition | Behavior |
|------|-----------|----------|
| A: Voice OFF | `voiceEnabled = false` | Tokens stream to display in real-time |
| B: Paragraph (production) | `voiceEnabled = true, tts_sentence_stream = false` | Server detects paragraph breaks, plays P1/P2/P3 via paragraph drain loop |
| C: Structured 3-chunk | `voiceEnabled = true, tts_sentence_stream = true` | Server extracts JSON fields (feedback_quick, feedback_detail, question), emits `{ chunk, text }` SSE events |

### 3.2 Branching Point

`practice/page.tsx` line 691:
```typescript
chunkedResponse: voiceEnabledRef.current && sentenceStreamRef.current
```

This flag is passed to the API, which tells `exam-engine.ts` to use `STRUCTURED_RESPONSE_INSTRUCTION` (forcing Claude to output 3-field JSON) and `extractStructuredChunks()` for streaming field detection.

### 3.3 Client-Side Pipeline

When `chunkedResponse = true`:
1. Server emits `{ chunk: "feedback_quick", text: "..." }` SSE events
2. `sentenceTTS.enqueue(parsed.text)` queues each chunk
3. `useSentenceTTS` drain loop processes chunks sequentially via `speak()`
4. `onSentenceStart` callback reveals text in the UI

## 4. Root Cause Analysis

### 4.1 Feature Flag Never Seeded

The `tts_sentence_stream` key was never inserted into the `system_config` table. The `/api/flags` route defaults to `false` when the row doesn't exist. No migration ever created the row.

**Impact**: Path C was dead code in production. Path B (paragraphs) was always used.

### 4.2 Four Latent Bugs in Path C

Even if the flag were enabled, 4 bugs would have caused failures:

| # | Severity | Bug | File | Line |
|---|----------|-----|------|------|
| 1 | CRITICAL | **Double-speak at stream end** — when `chunksReceived > 0` but `paragraphsReceived === 0`, the stream-end handler fell through to `speakText(examinerMsg)`, double-speaking chunks already queued in sentenceTTS | practice/page.tsx | 990-996 |
| 2 | CRITICAL | **Text-audio desync** — `onSentenceStart` fired BEFORE `speak()` TTS fetch, showing text 500ms-2s before audio played | useSentenceTTS.ts | 85 |
| 3 | HIGH | **Missing flush()** — `sentenceTTS.flush()` was never called after SSE stream ended, preventing `onAllDone` from firing | practice/page.tsx | stream-end |
| 4 | MEDIUM | **speak() type mismatch** — `useSentenceTTS` defined `speak: (text: string) => Promise<void>`, silently dropping the `onReady` callback; practice page wrapper `(text) => voice.speak(text)` also dropped it | useSentenceTTS.ts:8, practice/page.tsx:201 |

### 4.3 Codex Review Confirmation

All 4 bugs were independently confirmed by GPT-5.1 Codex via PAL MCP code review. The expert analysis also verified that:
- Claude JSON failure fallback (exam-logic.ts:548-552) is safe
- Barge-in handling is correct
- Late chunk emission won't cause issues

## 5. Fixes Applied

### Fix 1: speak() type + drain loop sync (useSentenceTTS.ts)

**Before:**
```typescript
speak: (text: string) => Promise<void>;
// ...
onSentenceStartRef.current?.(sentence);  // text appears
await speakRef.current(sentence);         // then TTS fetch + play
```

**After:**
```typescript
speak: (text: string, onReady?: () => void) => Promise<void>;
// ...
await speakRef.current(sentence, () => {
  onSentenceStartRef.current?.(sentence); // text appears when audio ready
});
```

Text reveal now fires via the `onReady` callback, which executes after TTS fetch completes and right before `audio.play()`. This eliminates the 500ms-2s text-ahead-of-voice gap.

### Fix 2: speak wrapper passthrough (practice/page.tsx:201)

**Before:** `speak: (text) => voice.speak(text)`
**After:** `speak: (text, onReady) => voice.speak(text, onReady)`

The `onReady` callback was being silently dropped by the wrapper.

### Fix 3: Stream-end double-speak prevention (practice/page.tsx:978-1002)

**Before:**
```typescript
if (paragraphsReceived > 0) { ... }
else { speakText(examinerMsg); } // BUG: double-speak when chunks active
```

**After:**
```typescript
if (chunksReceived > 0) {
  pendingFullTextRef.current = examinerMsg; // for error recovery
  sentenceTTS.flush();
} else if (paragraphsReceived > 0) { ... }
else { speakText(examinerMsg); }
```

Added a `chunksReceived > 0` check as the first branch. When chunks were used, calls `sentenceTTS.flush()` (not `speakText()`), preventing double-speak. Also sets `pendingFullTextRef` so `flushReveal()` can show full text on error/barge-in.

### Fix 4: flush() now called at stream end

The `sentenceTTS.flush()` call in Fix 3 also resolves the issue where `flush()` was never called, allowing `onAllDone` to fire properly after all chunks are spoken.

## 5a. Post-Activation Bugs (Phase E.1)

After enabling the feature flag in production, user testing revealed two critical regressions:

### 4.4 Two Post-Activation Bugs

| # | Severity | Bug | Root Cause |
|---|----------|-----|------------|
| 5 | CRITICAL | **All text appears at once** — voice starts well behind text. All examiner text revealed immediately, destroying progressive per-chunk reveal | `pendingFullTextRef.current = examinerMsg` (Fix 3) triggers the `isSpeaking` effect (lines 487-493) on first `voice.isSpeaking` transition, calling `flushReveal()` which reveals ALL text at once |
| 6 | CRITICAL | **Two audio files overlapping** — concurrent audio playback | `useVoiceProvider.speak()` did not stop/abort any previously playing audio. If concurrent `speak()` calls occurred (from different TTS pipelines or any re-entry), two `Audio` elements played simultaneously |

### 4.5 GPT-5.2 Review Confirmation

Both bugs were confirmed by GPT-5.2 via PAL MCP code review. Expert analysis also identified:
- `cancel()` in useSentenceTTS eagerly resets `cancelledRef` to false — drain loop can resume unexpectedly
- Barge-in paths inconsistently cancel sentenceTTS vs paragraph queue
- `speak()` abort event listener has minor leak (no `{ once: true }`)

### Fix 5: chunkModeActiveRef guard on isSpeaking effect (practice/page.tsx)

Added `chunkModeActiveRef` that is `true` while chunks are being processed. The `isSpeaking` effect now returns early when chunk mode is active:

```typescript
useEffect(() => {
  if (chunkModeActiveRef.current) return; // chunk path handles its own text reveal
  if (pendingFullTextRef.current) {
    flushReveal();
  }
}, [voice.isSpeaking, flushReveal]);
```

Lifecycle:
- Set `true` on first `{ chunk, text }` SSE event
- Cleared in `onAllDone` (normal completion) and `onError` (TTS failure)
- Cleared in `sendAnswer()` (barge-in)

### Fix 6: speak() stop-previous guard (useVoiceProvider.ts)

Added defensive audio cleanup at the start of `speak()`:

```typescript
// Stop any previously playing audio to prevent overlap
if (ttsAbortRef.current) {
  ttsAbortRef.current.abort();
}
if (audioRef.current) {
  audioRef.current.pause();
  audioRef.current = null;
}
```

For sequential calls (drain loop), these are no-ops since previous audio has already ended. For concurrent calls from any code path, this prevents two Audio elements from playing simultaneously.

### Migration: Feature flag seed

Created `20260310000002_seed_tts_sentence_stream.sql`:
```sql
INSERT INTO system_config (key, value, description) VALUES
  ('tts_sentence_stream', '{"enabled": false}',
   'Enable structured 3-chunk response delivery with per-chunk TTS streaming')
ON CONFLICT (key) DO NOTHING;
```

Default: disabled. Admin toggles on via dashboard when ready.

## 6. Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useSentenceTTS.ts` | MODIFIED | speak type + onReady sync in drain loop |
| `src/app/(dashboard)/practice/page.tsx` | MODIFIED | speak wrapper, stream-end branching, pendingFullTextRef, chunkModeActiveRef guard |
| `src/hooks/useVoiceProvider.ts` | MODIFIED | speak() stop-previous guard to prevent overlapping audio |
| `src/hooks/__tests__/useSentenceTTS.test.ts` | CREATED | 14 regression tests (drain loop + guard + stop-previous) |
| `supabase/migrations/20260310000002_seed_tts_sentence_stream.sql` | CREATED | Feature flag row in system_config |

## 7. Frozen Files (No Changes)

These voice stack files were verified as correct and left untouched:
- ~~`src/hooks/useVoiceProvider.ts`~~ — Modified in Phase E.1 (stop-previous guard)
- `src/lib/audio-unlock.ts` — Safari autoplay pre-warming
- `src/hooks/useDeepgramSTT.ts` — Deepgram Nova-3 WebSocket STT
- `src/lib/voice/tts/deepgram-tts.ts` — Deepgram Aura-2 TTS
- `src/lib/voice/provider-factory.ts` — provider selection
- `src/app/api/tts/route.ts` — TTS endpoint
- `next.config.ts` — CSP with media-src
- `src/lib/exam-engine.ts` — structured response already implemented
- `src/lib/exam-logic.ts` — chunk extraction already implemented

## 8. Testing

### New Tests (14)
- `useSentenceTTS.test.ts`: drain loop onReady sync contract (5), sequential playback (1), error resilience (1), flush+onAllDone (2), double-speak prevention (3), chunkModeActiveRef guard (3), speak stop-previous (1) — but actual count is 3 in the stream-end prevention group)

### Existing Tests (1210)
All pass. No regressions.

### TypeScript
Zero errors (`npx tsc --noEmit`).

## 9. Activation Sequence

1. Deploy code changes (4 bug fixes + migration)
2. Migration runs automatically — seeds `tts_sentence_stream` row with `enabled: false`
3. Admin enables flag via Supabase dashboard: `UPDATE system_config SET value = '{"enabled": true}' WHERE key = 'tts_sentence_stream'`
4. Next exam session with voice enabled will use 3-chunk delivery

## 10. UX Contract (Target)

When `tts_sentence_stream = true` and voice is enabled:

1. Student submits answer
2. Loading indicator shows (examiner "thinking")
3. Claude generates structured JSON response
4. Server extracts `feedback_quick` field -> emits `{ chunk, text }` SSE
5. Client enqueues in sentenceTTS -> TTS fetch -> onReady fires -> text appears + audio plays
6. `feedback_detail` arrives -> same flow (sequential, no overlap)
7. `question` arrives -> same flow
8. Stream ends -> `sentenceTTS.flush()` -> onAllDone fires
9. Student sees complete response, audio finished

**Key invariant:** Text for each chunk appears at the exact moment its audio starts playing — not before, not after.

## 11. Rollback

All changes are additive. To rollback:
1. Set feature flag to `false` in system_config
2. Path B (paragraphs) continues working unchanged
3. Code changes are inert when flag is off

## 12. Known Limitations

- Feature flag cached for 60s by `/api/flags` — toggling takes up to 60s to propagate
- If Claude ignores the JSON instruction, safety net (exam-logic.ts:548-552) emits entire text as `feedback_quick` — user sees one chunk instead of three (graceful degradation)
- `useSentenceTTS` refs (`flushedRef`, `hasSentencesRef`) not reset after `onAllDone` — mitigated by `cancel()` call in `sendAnswer()` before each new response

## 13. Verification Evidence

```
TypeScript: 0 errors
Tests: 56 files, 1224 tests (14 new) — all pass
GPT-5.1 Codex review: original 4 bugs confirmed, fixes verified safe
GPT-5.2 review: 2 post-activation bugs confirmed, fixes 5+6 verified safe
```

## 14. Recommendations

1. **Enable flag in staging first** — validate 3-chunk delivery in real browser before production
2. **Monitor PostHog** — track `tts_sentence_stream` usage patterns after activation
3. **Clean up dead code** — `useStreamingPlayer.ts` and `pcm-playback-processor.js` are unused
4. **Fix pre-existing TTS quota bug** — counts rows, not character sum

## 15. References

- Phase A: Deepgram 400 Fix (commit 5efcec8)
- Phase B: Browser Playback Fix (commit after Phase A)
- Phase C: CSP media-src Fix
- Phase D: Audio Overlap + Text Sync Fix (commits b90a585, b4d725a)
- Phase E (this): Response Delivery Coordination
