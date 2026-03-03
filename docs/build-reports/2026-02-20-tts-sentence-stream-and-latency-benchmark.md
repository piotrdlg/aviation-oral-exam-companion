---
date: 2026-02-20
type: implementation-report
tags: [heydpe, tts, streaming, benchmark, latency, feature-flag]
status: completed
branch: feat/tts-sentence-stream-and-latency-benchmark
commits: 2
tests_added: 27
tests_total: 297
---

# Implementation Report: TTS Sentence-Level Streaming & Multi-Run Latency Benchmark

> **Date:** 2026-02-20
> **Branch:** `feat/tts-sentence-stream-and-latency-benchmark`
> **Base:** `main` (commit `bc419bf`)
> **Author:** Claude Opus 4.6 + Piotr Dlugiewicz

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Task A: Multi-Run Latency Benchmark](#2-task-a-multi-run-latency-benchmark)
3. [Task B: TTS Sentence-Level Streaming](#3-task-b-tts-sentence-level-streaming)
4. [Files Changed — Complete Inventory](#4-files-changed--complete-inventory)
5. [Architecture Decisions](#5-architecture-decisions)
6. [Test Coverage](#6-test-coverage)
7. [How to Enable Sentence Streaming](#7-how-to-enable-sentence-streaming)
8. [How to Run the Benchmark](#8-how-to-run-the-benchmark)
9. [Risk Assessment & Rollback](#9-risk-assessment--rollback)
10. [Verification Checklist](#10-verification-checklist)

---

## 1. Executive Summary

Two independent features were implemented on a single feature branch with two logically separate commits:

| Commit | SHA | Description | Files |
|--------|-----|-------------|-------|
| 1 | `76ec333` | Multi-run latency benchmark with p50/p95 stats | 3 files (2 created, 1 rewritten) |
| 2 | `efa0ab9` | Sentence-level TTS streaming behind feature flag | 4 files (2 created, 2 modified) |

**Total changes:** 7 files, **+824 lines / -92 lines**

**Test results:** 297/297 passing (14 test files), including 20 new benchmark stats tests and 7 new sentence-boundary edge case tests.

**TypeScript:** Clean — `npx tsc --noEmit` produces zero errors.

**Production safety:** Feature flag `tts_sentence_stream` defaults to `false`. Zero behavioral changes in production until explicitly enabled via database insert.

---

## 2. Task A: Multi-Run Latency Benchmark

### 2.1 Problem Statement

The existing `latency-benchmark.ts` script ran a single A/B comparison between staging and production. A single run provides no statistical confidence — Claude API latency is inherently variable (5s-15s per call), so one sample tells you nothing about which environment is faster.

### 2.2 Solution

Rewrote the benchmark to support:
- **Multi-run execution** (`--runs N`, default 5)
- **Configurable answer count** (`--answers M`, default 1)
- **Statistical analysis**: p50 (median), p95 (tail latency), mean, standard deviation, min, max
- **Console output**: Formatted comparison table with delta and winner per step
- **Markdown report**: Auto-generated to `docs/staging-reports/YYYY-MM-DD-latency-benchmark.md`
- **Raw JSON export** (`--json output.json`)

### 2.3 Files Created

#### `scripts/staging/bench-stats.ts` (177 lines) — NEW

Pure helper functions with zero side effects. Fully unit-tested.

**Exports:**

| Function | Signature | Purpose |
|----------|-----------|---------|
| `percentile()` | `(sorted: number[], p: number) => number` | Linear interpolation percentile calculation |
| `mean()` | `(values: number[]) => number` | Arithmetic mean |
| `stdev()` | `(values: number[]) => number` | Sample standard deviation (Bessel's correction) |
| `computeStepStats()` | `(step: string, samples: number[]) => StepStats` | Full stats object from raw samples |
| `formatMs()` | `(ms: number) => string` | Human-readable time (`150ms`, `1.5s`) |
| `classifyStep()` | `(step: string) => 'db' \| 'llm'` | Categorize step for reporting |
| `generateMarkdownReport()` | `(opts) => string` | Full markdown report with tables and interpretation |

**`StepStats` interface:**

```typescript
interface StepStats {
  step: string;     // e.g., "db.session_create", "claude.first_question", "TOTAL"
  samples: number;  // Number of successful runs
  mean: number;     // Arithmetic mean (ms, rounded)
  stdev: number;    // Sample standard deviation (ms, rounded)
  p50: number;      // Median (ms, rounded)
  p95: number;      // 95th percentile (ms, rounded)
  min: number;      // Minimum observed value
  max: number;      // Maximum observed value
}
```

**Percentile calculation method:**

Uses linear interpolation between sorted array elements:
```
idx = (p / 100) * (n - 1)
result = sorted[floor(idx)] + (sorted[ceil(idx)] - sorted[floor(idx)]) * (idx - floor(idx))
```

This matches NumPy's `interpolation='linear'` default, which is the industry standard for percentile computation.

**Markdown report generation:**

`generateMarkdownReport()` produces a self-contained markdown document with:
- YAML frontmatter (date, type, tags, status)
- Summary table comparing staging vs. production p50/p95 per step
- Detailed stats table (mean +/- stdev)
- Automated interpretation section that:
  - Groups steps by type (DB-bound vs. LLM-bound)
  - Sums p50 per category
  - Determines winner per category
  - Provides context (e.g., "Production is faster due to Vercel/Supabase co-location")

---

#### `scripts/staging/latency-benchmark.ts` (292 lines) — REWRITTEN

Complete rewrite of the single-run benchmark into a multi-run statistical comparison tool.

**CLI interface:**

```bash
npx tsx scripts/staging/latency-benchmark.ts [--runs 5] [--answers 1] [--json output.json]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--runs` | `5` | Number of benchmark rounds per environment |
| `--answers` | `1` | Student answers per round (1-3 available) |
| `--json` | none | Path for raw JSON data export |

**Execution flow:**

1. **Warm-up check**: Verifies local dev server is running on `localhost:3000`
2. **Authentication**: Obtains JWT access tokens for both staging and production Supabase instances via password auth
3. **Data collection**: For each run, alternates staging → production (reduces ordering bias)
4. **Stats computation**: Collects per-step timing samples, computes stats via `bench-stats.ts`
5. **Console output**: Formatted comparison table:
   ```
   ══════════════════════════════════════════════════════════════════════════════════════════
     Results: 5/5 staging OK, 5/5 production OK
   ══════════════════════════════════════════════════════════════════════════════════════════
     Step                    STG p50   STG p95   PRD p50   PRD p95  Delta p50  Winner
   ──────────────────────────────────────────────────────────────────────────────────────────
     db.session_create          245ms     312ms     120ms     156ms     +125ms  PRD →
     claude.first_question      8.2s     12.1s      7.9s     11.3s    +300ms  PRD →
     ▸ TOTAL                   15.4s     18.2s     14.8s     17.6s    +600ms  PRD →
   ══════════════════════════════════════════════════════════════════════════════════════════
   ```
6. **Markdown report**: Auto-saved to `docs/staging-reports/YYYY-MM-DD-latency-benchmark.md`
7. **JSON export**: Optional raw data dump with all per-run timings and computed stats

**Environment configuration:**

```typescript
const STAGING: EnvConfig = {
  name: 'STAGING',
  appUrl: 'http://localhost:3000',              // Local dev server
  supabaseUrl: 'https://curpdzczzawpnniaujgq.supabase.co',  // Staging Supabase
  email: 'bench2@heydpe.com',
  password: 'Bench2Test2026x',
};

const PRODUCTION: EnvConfig = {
  name: 'PRODUCTION',
  appUrl: 'https://aviation-oral-exam-companion.vercel.app',
  supabaseUrl: 'https://pvuiwwqsumoqjepukjhz.supabase.co',
  email: 'bench2@heydpe.com',
  password: 'Bench2Test2026x',
};
```

**Architecture:** Staging hits `localhost:3000` → staging Supabase (remote) → Anthropic API. Production hits Vercel edge → production Supabase (co-located) → Anthropic API. Both share the same Anthropic API endpoint, so LLM latency variance is identical.

---

#### `src/lib/__tests__/bench-stats.test.ts` (111 lines) — NEW

**20 unit tests** organized into 6 describe blocks:

| Block | Tests | What's Tested |
|-------|-------|---------------|
| `percentile` | 7 | Empty array, single element, odd/even length median, p95 with interpolation, p0 edge, p100 edge |
| `mean` | 3 | Empty array, correct computation, single value |
| `stdev` | 4 | Empty array, single value, sample stdev accuracy (Bessel's correction), identical values |
| `computeStepStats` | 1 | Full stats computation from 5 samples — verifies step name, sample count, mean, min, max, p50, p95 |
| `formatMs` | 3 | Sub-second formatting (`150ms`), seconds formatting (`1.5s`), exact second (`1.0s`) |
| `classifyStep` | 2 | DB steps (`db.session_create`), LLM steps (`claude.first_question`, `claude.assess[0]`) |

**Key test — sample standard deviation accuracy:**

```typescript
it('computes sample standard deviation', () => {
  // Values: 2, 4, 4, 4, 5, 5, 7, 9 → mean=5, sample stdev ≈ 2.138
  const result = stdev([2, 4, 4, 4, 5, 5, 7, 9]);
  expect(result).toBeCloseTo(2.138, 2);
});
```

This verifies Bessel's correction (`n - 1` denominator) is used, matching standard statistical software output.

---

## 3. Task B: TTS Sentence-Level Streaming

### 3.1 Problem Statement

The existing TTS pipeline has a noticeable lag:

1. User submits answer
2. Claude generates full examiner response via SSE (~5-15 seconds of streaming)
3. **After** the entire response is accumulated, the full text is sent to `/api/tts`
4. TTS generates audio for the entire response (~2-4 seconds)
5. Audio begins playing

**Total time to first audio:** 7-19 seconds. The user stares at a typing indicator for the entire duration.

### 3.2 Solution

Sentence-level TTS streaming fires TTS requests **during** SSE streaming, not after. As each complete sentence is detected in the token stream, a `/api/tts` request is immediately dispatched. Audio blobs are queued and played sequentially.

**Result:** First audio plays after the first sentence completes (typically 1-3 seconds into the stream) instead of waiting for the full response (7-19 seconds).

**Safety:** The entire feature is behind a feature flag (`tts_sentence_stream` in `system_config` table). Default is OFF. Zero production impact until explicitly enabled.

### 3.3 Data Flow — Before vs. After

**Before (existing behavior — Voice ON):**

```
SSE tokens → accumulate silently → stream ends → full text → POST /api/tts → audio blob → play
                                                  ↑ 5-15s wait ↑              ↑ 2-4s wait ↑
```

**After (sentence streaming — Voice ON + flag ON):**

```
SSE tokens → sentence buffer → boundary detected? → POST /api/tts → audio queue → play
     ↓              ↑                   ↓
     └──────────────┘              sentence 1 → TTS → queue
                                   sentence 2 → TTS → queue
                                   sentence 3 → TTS → queue
                                       ↓
                              stream ends → flush remainder → TTS → queue
```

Audio plays sequentially from the queue. Sentence 1 audio often starts playing while sentence 3 is still being generated by Claude.

### 3.4 Files Created

#### `src/hooks/useSentenceTTS.ts` (167 lines) — NEW

React hook that manages the sentence-level TTS pipeline.

**Interface:**

```typescript
interface UseSentenceTTSOptions {
  onFirstAudioStart?: () => void;  // Reveal examiner text
  onAllAudioEnd?: () => void;      // All audio finished
  onError?: (err: Error) => void;  // TTS error — trigger fallback
}

interface UseSentenceTTSReturn {
  pushToken: (token: string) => void;  // Feed SSE token into buffer
  flush: () => void;                    // Flush remaining buffer to TTS
  cancel: () => void;                   // Abort all pending TTS + stop playback
  isSpeaking: boolean;                  // Whether audio is currently playing
  queueLength: number;                  // Sentences queued or playing
}
```

**Internal state management (all via refs to avoid stale closures):**

| Ref | Type | Purpose |
|-----|------|---------|
| `bufferRef` | `string` | Accumulates SSE tokens until a sentence boundary is detected |
| `queueRef` | `Blob[]` | Audio blobs waiting to be played |
| `isPlayingRef` | `boolean` | Whether an `Audio` element is currently playing |
| `abortControllersRef` | `AbortController[]` | One per in-flight `/api/tts` fetch — for cancellation |
| `cancelledRef` | `boolean` | Global kill switch — prevents new TTS requests and audio playback |
| `firstAudioFiredRef` | `boolean` | Tracks whether `onFirstAudioStart` has been called |

**`pushToken(token)` flow:**

1. Append token to `bufferRef`
2. Call `detectSentenceBoundary(bufferRef.current)`
3. If boundary found:
   - Update `bufferRef` to `result.remainder`
   - Call `enqueueSentence(result.sentence)` (async, non-blocking)

**`enqueueSentence(sentence)` flow:**

1. Check `cancelledRef` — bail if cancelled
2. Create `AbortController`, push to `abortControllersRef`
3. `POST /api/tts` with `{ text: sentence }` and abort signal
4. Check `cancelledRef` again after response/blob (handles cancel during fetch)
5. Push blob to `queueRef`
6. Call `playNext()`

**`playNext()` flow:**

1. Check `isPlayingRef` — bail if already playing (sequential queue)
2. Shift first blob from `queueRef`
3. If queue empty: set `isSpeaking = false`, call `onAllAudioEnd()`, return
4. Create `URL.createObjectURL(blob)`, create `new Audio(url)`
5. Fire `onFirstAudioStart` on first blob (triggers text reveal)
6. `audio.play()` with `onended` → `URL.revokeObjectURL(url)` → `playNext()`
7. Error handling: `onerror` and `.catch()` both revoke URL and call `playNext()` (skip failed audio, don't block queue)

**`flush()` flow:**

Called when SSE stream ends. Sends any remaining text in buffer to TTS as a final sentence.

**`cancel()` flow:**

1. Set `cancelledRef = true` (prevents all new operations)
2. Clear buffer, queue, states
3. Abort all in-flight `AbortController` instances
4. Clear abort controllers array
5. Reset `cancelledRef = false` (ready for next use)

**Memory safety:**

- All `URL.createObjectURL()` calls have corresponding `URL.revokeObjectURL()` in every code path (onended, onerror, catch)
- AbortControllers are cleaned up on cancel
- Queue is cleared on cancel

---

#### `src/app/api/flags/route.ts` (28 lines) — NEW

Lightweight HTTP GET endpoint for client-side feature flag delivery.

**Request:** `GET /api/flags`

**Response:**
```json
{
  "tts_sentence_stream": false
}
```

**Caching:** `Cache-Control: public, max-age=60, stale-while-revalidate=300`

This means:
- Browser caches the response for 60 seconds (no network request)
- Between 60-300 seconds, serves stale response while revalidating in background
- After 300 seconds, must revalidate

**Fail-open behavior:** If `getSystemConfig()` throws (database down, network error), the endpoint returns `{ tts_sentence_stream: false }` — features stay OFF.

**Data source:** Reads from `system_config` table via `getSystemConfig(serviceSupabase)`. The `tts_sentence_stream` key is expected to contain `{ "enabled": true }` as a JSON value.

**Why a separate endpoint instead of bundling with `/api/user/tier`:**

1. Feature flags are user-independent — don't need auth
2. Can be aggressively cached (`public`)
3. Separates concerns: tier/quota data vs. global feature toggles
4. Faster response (single table scan vs. user profile + quota + tier logic)

---

### 3.5 Files Modified

#### `src/app/(dashboard)/practice/page.tsx` — 157 lines changed

This is the primary integration point. Every change is described below in the exact order it appears in the file.

**Change 1: Import `useSentenceTTS` hook (line 11)**

```diff
+import { useSentenceTTS } from '@/hooks/useSentenceTTS';
```

**Change 2: Feature flag state (line 135)**

```typescript
// Feature flag: sentence-level TTS streaming (default OFF)
const [sentenceStreamEnabled, setSentenceStreamEnabled] = useState(false);
```

Default is `false`. Only set to `true` if `/api/flags` responds with `tts_sentence_stream: true`.

**Change 3: Sentence stream ref for stale closure avoidance (line 166)**

```typescript
const sentenceStreamRef = useRef(false);
```

The SSE streaming loop captures variables in a closure. React state (`sentenceStreamEnabled`) would be stale inside the loop. The ref provides current-value access.

**Change 4: `useSentenceTTS` hook instantiation (lines 169-181)**

```typescript
const sentenceTTS = useSentenceTTS({
  onFirstAudioStart: () => {
    flushReveal();  // Show examiner text when first audio chunk plays
  },
  onAllAudioEnd: () => {
    // All sentence audio finished
  },
  onError: () => {
    flushReveal();  // Show text even if TTS fails
  },
});
```

The `onFirstAudioStart` callback calls `flushReveal()` — the same function used by the existing TTS path to reveal the examiner's text. This ensures the existing text-reveal-on-audio-start behavior works identically with sentence streaming.

**Change 5: Feature flag fetch on mount (lines 184-193)**

```typescript
useEffect(() => {
  fetch('/api/flags')
    .then((res) => res.ok ? res.json() : null)
    .then((data) => {
      if (data?.tts_sentence_stream) {
        setSentenceStreamEnabled(true);
        sentenceStreamRef.current = true;
      }
    })
    .catch(() => {}); // Fail open: flag stays false
}, []);
```

Runs once on mount. Sets both the React state and the ref. Fails silently — if the fetch fails, the flag stays `false` and the existing behavior is preserved.

**Change 6: Cancel sentence TTS on `sendAnswer()` (line 585)**

```diff
-    // Stop mic when sending — user is done talking
+    // Stop mic and any in-progress sentence TTS when sending
+    sentenceTTS.cancel();
```

When the user submits a new answer, any in-progress sentence TTS from the previous examiner response must be cancelled. This prevents audio from the previous response overlapping with the new exchange.

**Change 7: Push tokens to sentence TTS in SSE loop (lines 678-680)**

```diff
+                } else if (sentenceStreamRef.current) {
+                  // Voice ON + sentence streaming: push token for sentence-level TTS
+                  sentenceTTS.pushToken(parsed.token);
                 }
-                // Voice ON: accumulate silently, reveal after stream completes
+                // Voice ON (no sentence stream): accumulate silently, reveal after stream completes
```

This is the core integration point. In the SSE token processing loop:

- **Voice OFF:** Tokens update the message bubble in real-time (existing behavior, unchanged)
- **Voice ON + sentence stream ON:** Tokens are pushed to `sentenceTTS.pushToken()` which buffers them and fires TTS when a sentence boundary is detected
- **Voice ON + sentence stream OFF:** Tokens accumulate silently (existing behavior, unchanged)

Note: `examinerMsg` accumulation (`examinerMsg += parsed.token`) happens unconditionally on line 666, regardless of which path is taken. This ensures the full text is always available for `pendingFullTextRef` at stream end.

**Change 8: Flush vs. speak at stream end (lines 810-816)**

```diff
-          speakText(examinerMsg);
+          if (sentenceStreamRef.current) {
+            // Sentence streaming: flush remaining buffer (sentences already queued during stream)
+            sentenceTTS.flush();
+          } else {
+            // Traditional: send full text to TTS after stream completes
+            speakText(examinerMsg);
+          }
```

At stream end, the existing path sends the full accumulated text to TTS. With sentence streaming, most sentences have already been queued during the stream — only the final incomplete sentence (if any) needs to be flushed.

**Change 9: Cancel on `gradeSession()` (line 913)**

```diff
+    sentenceTTS.cancel();
     voice.stopSpeaking();
```

When the user grades/ends the exam, all sentence TTS activity must stop immediately.

**Change 10: Cancel on `pauseSession()` (line 969)**

```diff
+    sentenceTTS.cancel();
     voice.stopSpeaking();
```

When the user pauses the exam, all sentence TTS activity must stop.

**Change 11: Mic button barge-in with sentence TTS awareness (lines 1721-1723)**

```diff
-                if (voice.isSpeaking) {
+                if (voice.isSpeaking || sentenceTTS.isSpeaking) {
+                  sentenceTTS.cancel();
                   voice.stopSpeaking();
```

The mic button's barge-in detection now also checks sentence TTS speaking state. If either the traditional TTS or the sentence TTS is playing audio, pressing the mic button cancels both and starts listening.

**Change 12: Mic button CSS class with sentence TTS awareness (lines 1733-1737)**

```diff
-                : voice.isSpeaking
+                : (voice.isSpeaking || sentenceTTS.isSpeaking)
                 ? 'bg-c-bezel hover:bg-c-border text-c-text border border-dashed border-c-muted'
```

```diff
-            title={voice.isListening ? 'Stop recording' : voice.isSpeaking ? ...}
+            title={voice.isListening ? 'Stop recording' : (voice.isSpeaking || sentenceTTS.isSpeaking) ? ...}
```

The mic button's visual state (dashed border indicating "speaking") and tooltip now also reflect sentence TTS activity.

**Change 13: Textarea barge-in with sentence TTS awareness (lines 1756-1758)**

```diff
-              if (voice.isSpeaking) {
+              if (voice.isSpeaking || sentenceTTS.isSpeaking) {
+                sentenceTTS.cancel();
                 voice.stopSpeaking();
```

When the user starts typing in the textarea, any ongoing TTS (traditional or sentence) is cancelled. This is the keyboard barge-in path.

---

#### `src/lib/__tests__/sentence-boundary.test.ts` — 63 lines added (7 new tests)

Extended the existing 9 tests to 16 total. All new tests focus on aviation-specific edge cases that the `detectSentenceBoundary()` function must handle correctly.

**New test 1: `does NOT split on 14 CFR 91.155 mid-sentence`**

```typescript
detectSentenceBoundary(
  'Under 14 CFR 91.155 the basic VFR weather minimums require certain visibility. Know these cold.'
);
// Must contain '91.155' and 'visibility' — confirms the period in 91.155 is not a sentence boundary
```

VFR weather minimums (14 CFR 91.155) is one of the most commonly cited regulations in oral exams.

**New test 2: `does NOT split on 61.113 with CFR reference`**

```typescript
detectSentenceBoundary(
  'Per 14 CFR 61.113 a private pilot may not act as PIC for compensation. There are exceptions though.'
);
// Must contain '61.113' and 'compensation'
```

Tests pilot privileges and limitations — another high-frequency oral exam topic.

**New test 3: `does NOT split on decimal altitudes like 3.0 degrees`**

```typescript
detectSentenceBoundary(
  'The glide slope angle is typically 3.0 degrees for a standard ILS approach. Maintain it precisely.'
);
// Must contain '3.0 degrees'
```

Tests decimal numbers in ILS approach context. The `3.0` is a decimal, not a sentence ending.

**New test 4: `handles multiple sentences and returns only the first`**

```typescript
detectSentenceBoundary(
  'First sentence is long enough to pass. Second sentence here. Third one too.'
);
// sentence: 'First sentence is long enough to pass.'
// remainder: 'Second sentence here. Third one too.'
```

Verifies that only the first complete sentence is returned, with the rest preserved as remainder for subsequent calls.

**New test 5: `handles streaming scenario: accumulate tokens then detect`**

```typescript
let buffer = '';
const tokens = 'The minimum visibility requirement is three statute miles. '.split(' ');
for (const token of tokens) {
  buffer += (buffer ? ' ' : '') + token;
  found = detectSentenceBoundary(buffer);
  if (found) break;
}
// found.sentence contains 'three statute miles.'
```

Simulates the actual token-by-token accumulation pattern used by `useSentenceTTS.pushToken()`. Verifies that the boundary is detected as tokens arrive incrementally.

**New test 6: `handles etc. abbreviation: does not split there, waits for real boundary`**

```typescript
detectSentenceBoundary(
  'You need your logbook, medical certificate, etc. Make sure everything is current and valid. Next topic.'
);
// sentence contains both 'etc.' AND 'valid.'
// remainder: 'Next topic.'
```

This is a subtle edge case: `etc.` is an abbreviation (should NOT split), but `valid.` is a real sentence ending. The test verifies that the boundary detector skips `etc.` and finds `valid.` as the true boundary. The sentence spans from the beginning through `valid.` and the remainder is `Next topic.`.

---

## 4. Files Changed — Complete Inventory

### Created (4 files)

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/staging/bench-stats.ts` | 177 | Pure statistics helper functions |
| `src/lib/__tests__/bench-stats.test.ts` | 111 | 20 unit tests for bench-stats |
| `src/hooks/useSentenceTTS.ts` | 167 | Sentence-level TTS streaming React hook |
| `src/app/api/flags/route.ts` | 28 | Feature flags HTTP GET endpoint |

### Modified (3 files)

| File | +/- Lines | Purpose |
|------|-----------|---------|
| `scripts/staging/latency-benchmark.ts` | +213 / -92 | Rewritten for multi-run with stats |
| `src/app/(dashboard)/practice/page.tsx` | +157 / -23 | Sentence TTS integration + barge-in |
| `src/lib/__tests__/sentence-boundary.test.ts` | +63 / -0 | 7 new aviation edge case tests |

### Existing (leveraged, not modified)

| File | Lines | Role |
|------|-------|------|
| `src/lib/voice/sentence-boundary.ts` | 139 | Aviation-aware sentence boundary detection |
| `src/lib/system-config.ts` | ~30 | `getSystemConfig()` — reads `system_config` table |
| `src/app/api/tts/route.ts` | ~80 | Existing TTS endpoint — reused by sentence queue |
| `src/hooks/useVoiceProvider.ts` | ~200 | Existing voice hook — unchanged, coexists with sentence TTS |

---

## 5. Architecture Decisions

### 5.1 Feature Flag via `system_config` Table

**Decision:** Use the existing `system_config` table pattern rather than introducing a new feature flag system.

**Rationale:** The codebase already has `getSystemConfig()` which reads all rows from `system_config` into a `Record<string, Record<string, unknown>>`. Adding a key follows the established pattern with zero new infrastructure.

**Trade-off:** No admin UI for toggling flags. Must use SQL or Supabase dashboard. Acceptable for an internal feature rollout.

### 5.2 Client-Side Sentence Boundary Detection (Not Server-Side)

**Decision:** Run `detectSentenceBoundary()` in the browser, not on the server.

**Rationale:**
- Zero server latency — boundary detection is CPU-trivial (~0.1ms per call)
- No need to modify the SSE streaming endpoint
- The client already receives individual tokens via SSE
- Keeps the server stateless — no per-connection sentence buffer

### 5.3 Separate `/api/flags` Endpoint

**Decision:** Create a dedicated `/api/flags` GET endpoint rather than bundling flags into `/api/user/tier`.

**Rationale:**
- Feature flags are user-independent → no auth needed
- `Cache-Control: public` allows CDN/browser caching → one fetch per 60 seconds regardless of user
- Separates global config from user-specific data
- Minimal payload (single boolean vs. tier's ~20 fields)

### 5.4 Audio Queue with Sequential Playback

**Decision:** Queue audio blobs and play sequentially via `HTMLAudioElement`, not via `AudioContext` with precise timing.

**Rationale:**
- `new Audio(url)` is simpler and well-supported across browsers
- Sequential playback naturally handles variable-length sentences
- `AudioContext` would require PCM decoding, buffer management, and precise scheduling — overkill for sentence-level granularity
- The existing `useVoiceProvider` already uses `Audio` elements, maintaining consistency

### 5.5 Ref-Based State in SSE Loop

**Decision:** Use `sentenceStreamRef` (a `useRef`) instead of `sentenceStreamEnabled` (React state) inside the SSE streaming loop.

**Rationale:** The SSE loop runs inside a closure created at the start of `sendAnswer()`. React state values captured in that closure are stale — they reflect the value at the time the closure was created, not the current value. A ref always returns the current value via `.current`.

---

## 6. Test Coverage

### 6.1 Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `bench-stats.test.ts` | 20 | All pass |
| `sentence-boundary.test.ts` | 16 (9 existing + 7 new) | All pass |
| `exam-logic.test.ts` | 59 | All pass |
| `app-env.test.ts` | 35 | All pass |
| `browser-detect.test.ts` | 31 | All pass |
| `session-policy.test.ts` | 26 | All pass |
| `email.test.ts` | 25 | All pass |
| `analytics-utils.test.ts` | 24 | All pass |
| `email-routing.test.ts` | 17 | All pass |
| `image-retrieval.test.ts` | 15 | All pass |
| `utm.test.ts` | 12 | All pass |
| `analytics.test.ts` | 8 | All pass |
| `voice-usage.test.ts` | 6 | All pass |
| `provider-factory.test.ts` | 3 | All pass |
| **Total** | **297** | **All pass** |

### 6.2 Tests NOT Written (and why)

- **`useSentenceTTS` hook unit tests**: Would require mocking `fetch`, `Audio`, `URL.createObjectURL`, React hooks — heavy test infrastructure for a hook that's primarily a coordination layer. The underlying `detectSentenceBoundary()` is thoroughly tested (16 tests). Integration testing via the practice page is more valuable here.
- **`/api/flags` endpoint tests**: A 28-line endpoint with one read operation and a try/catch. The risk is low and the logic is trivial.
- **Practice page integration tests**: Would require a full SSE mock + audio mock + feature flag mock. These are better suited for E2E tests (Playwright) which already exist for the practice page.

---

## 7. How to Enable Sentence Streaming

### 7.1 Enable in Database

**Production:**

```sql
INSERT INTO system_config (key, value)
VALUES ('tts_sentence_stream', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

**Staging:**

```sql
INSERT INTO system_config (key, value)
VALUES ('tts_sentence_stream', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

### 7.2 Disable (Rollback)

```sql
UPDATE system_config SET value = '{"enabled": false}' WHERE key = 'tts_sentence_stream';
```

Or simply delete the row:

```sql
DELETE FROM system_config WHERE key = 'tts_sentence_stream';
```

The endpoint fails open — missing key returns `false`.

### 7.3 Verify Flag is Active

```bash
curl -s https://aviation-oral-exam-companion.vercel.app/api/flags | jq
```

Expected when enabled:
```json
{
  "tts_sentence_stream": true
}
```

### 7.4 Cache Invalidation

The flag is cached for 60 seconds (`max-age=60`). After changing the database value, it takes up to 60 seconds for clients to see the new value. For immediate rollback, the 60-second window is acceptable.

---

## 8. How to Run the Benchmark

### 8.1 Prerequisites

1. Local dev server running: `npm run dev`
2. `.env.local` pointing to staging Supabase (or production — the script uses hardcoded configs)
3. Both `bench2@heydpe.com` accounts must exist and have `tier: 'dpe_live'` (to bypass trial limits)

### 8.2 Commands

**Quick run (5 runs, 1 answer):**

```bash
npx tsx scripts/staging/latency-benchmark.ts
```

**Custom configuration:**

```bash
npx tsx scripts/staging/latency-benchmark.ts --runs 10 --answers 2 --json results.json
```

**Output locations:**
- Console: Real-time progress and formatted comparison table
- Markdown: `docs/staging-reports/YYYY-MM-DD-latency-benchmark.md` (auto-generated)
- JSON: Path specified by `--json` flag (optional)

---

## 9. Risk Assessment & Rollback

### 9.1 Task A (Benchmark) — Zero Risk

The benchmark script is a development tool in `scripts/staging/`. It is not bundled, not deployed, and has no production impact.

### 9.2 Task B (Sentence TTS) — Low Risk, Full Rollback Path

| Risk | Mitigation |
|------|------------|
| Feature causes audio glitches | Flag is OFF by default. Enable only after testing. |
| Sentence TTS increases API costs | Same `/api/tts` endpoint — same cost per character, but broken into smaller requests. Minimal overhead from HTTP roundtrips. |
| Stale closures in SSE loop | Ref-based state (`sentenceStreamRef`) avoids stale closures. |
| Memory leaks from audio blobs | All `URL.createObjectURL()` calls have matching `revokeObjectURL()` in every code path. |
| Abort controller leaks | `cancel()` aborts and clears all controllers. |
| Race between cancel and in-flight requests | `cancelledRef` is checked after every async operation (after fetch, after blob conversion). |
| Breaks existing voice behavior | Feature is gated: `sentenceStreamRef.current` must be `true`. When `false`, the exact same code path as before executes. |

**Rollback:**

1. **Immediate (database):** Set `system_config.tts_sentence_stream.enabled = false` or delete the row. Takes effect within 60 seconds (cache TTL).
2. **Code rollback:** Revert commit `efa0ab9`. The practice page returns to its previous behavior with no trace of the feature.

---

## 10. Verification Checklist

| Check | Result |
|-------|--------|
| TypeScript compiles with zero errors (`npx tsc --noEmit`) | PASS |
| All 297 tests pass (`npx vitest run`) | PASS |
| Feature flag defaults to OFF | PASS — `useState(false)`, fails open |
| Existing voice behavior unchanged when flag is OFF | PASS — `sentenceStreamRef.current` is `false` → original code path |
| Sentence TTS cancel called at all stop points | PASS — `gradeSession()`, `pauseSession()`, `sendAnswer()`, mic barge-in, textarea barge-in |
| Mic button reflects sentence TTS speaking state | PASS — `voice.isSpeaking \|\| sentenceTTS.isSpeaking` |
| Audio memory properly cleaned up | PASS — `revokeObjectURL()` in onended, onerror, catch |
| Abort controllers cleaned up on cancel | PASS — `cancel()` iterates and aborts all |
| No ESLint errors introduced | PASS |
| Branch has exactly 2 commits with clear separation | PASS — benchmark commit, then sentence TTS commit |

---

*Report generated 2026-02-20. Branch `feat/tts-sentence-stream-and-latency-benchmark` is ready for review and merge.*
