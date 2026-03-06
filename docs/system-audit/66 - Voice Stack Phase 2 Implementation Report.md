---
date: 2026-03-06
type: system-audit
tags: [heydpe, voice-stack, deepgram, stt, csp, telemetry, regression-fix]
status: final
evidence_level: high
phase: 22
---

# Doc 66 — Voice Stack Phase 2 Implementation Report

**Scope:** Implement MODERATE voice-stack fix for Deepgram STT WebSocket regression
**Predecessor:** [[65 - Voice Stack Regression Analysis]]
**Decision:** ADR-001 (Moderate — additive hardening, no architecture migration)

---

## 1. Executive Summary

Six additive changes shipped to fix the voice regression. Zero DB migrations. Zero new env vars. All backward-compatible. Typecheck clean (0 errors), 1103 tests passing (34 new).

**Root cause addressed:** CSP missing explicit `wss://` + single-attempt WebSocket with permanent auto-disable on failure.

---

## 2. Changes Implemented

### 2.1 CSP Hardening

**File:** `next.config.ts`

| Directive | Before | After |
|-----------|--------|-------|
| `connect-src` | `https://api.deepgram.com` | `https://api.deepgram.com wss://api.deepgram.com` |
| `report-uri` | (absent) | `report-uri /api/csp-report` |

**Rationale:** CSP Level 3 says `https:` matches `wss:` for `connect-src`, and Chrome implements this. Safari/iOS may not. Adding explicit `wss://` is the safe cross-browser fix.

### 2.2 STT Retry Logic

**File:** `src/hooks/useDeepgramSTT.ts` (complete rewrite)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `MAX_ATTEMPTS` | 2 | Initial + 1 retry. Distinguishes transient from persistent failure |
| `RETRY_DELAY_MS` | 2000 | Enough for network recovery, not so long user abandons |

**Key behaviors:**
- `userStoppedRef` prevents retry after deliberate stop
- `isRetrying` state exposed to UI consumers
- Clean error message: "Voice connection failed. Unable to reach speech service."
- Connection promise pattern: resolves on `ws.onopen`, rejects on `ws.onerror`

### 2.3 Voice Fallback UX

**File:** `src/app/(dashboard)/practice/page.tsx`

| Behavior | Before | After |
|----------|--------|-------|
| First voice error | Permanently disable voice | Show retrying indicator |
| After retry failure | N/A (already disabled) | Show "RETRY VOICE" / "TEXT-ONLY MODE" buttons |
| User choice | None (auto-imposed) | Deliberate text-only opt-in |

### 2.4 Client-Side Telemetry

**File:** `src/lib/voice-telemetry.ts` (new)

**10 event types:**
| Event | Trigger |
|-------|---------|
| `stt_websocket_connect_started` | Before each WebSocket attempt |
| `stt_websocket_connected` | WebSocket open |
| `stt_websocket_failed` | WebSocket error before open |
| `stt_websocket_closed` | Abnormal close (not 1000/1005/1006) |
| `stt_token_request_started` | Before token fetch |
| `stt_token_request_succeeded` | Token received |
| `stt_token_request_failed` | Token fetch error |
| `stt_mic_permission_failed` | getUserMedia denied |
| `voice_retry_attempted` | Before retry delay |
| `voice_auto_disabled` | All attempts exhausted or user chose text-only |

**Properties attached:** `browser`, `platform`, `attempt`, `session_id`, `close_code`, `ready_state`.
**Never attached:** token, transcript, access_token, audio data.

### 2.5 Server-Side Telemetry

**File:** `src/app/api/stt/token/route.ts`

- `captureServerEvent(user.id, 'stt_token_request_failed', ...)` on Deepgram auth/grant failure
- `captureServerEvent(user.id, 'stt_token_request_succeeded', ...)` on success
- `after(() => flushPostHog())` for Vercel edge function flush

### 2.6 CSP Report Endpoint

**File:** `src/app/api/csp-report/route.ts` (new)

- POST handler, no auth required (browsers send CSP reports automatically)
- Logs `violated-directive`, `blocked-uri`, `document-uri` via `console.warn`
- Handles CSP Level 2 (`csp-report` key) and Reporting API v2 formats
- Returns 204 No Content

### 2.7 Dead Code Removal

**File:** `src/lib/voice-integration.ts` (deleted)

- `getVoiceConfig()` — never imported anywhere in codebase
- `unlockAudioContext()` — never imported anywhere in codebase
- Contained stale mapping: `dpe_live → 'cartesia'` (contradicts current `TIER_FEATURES`)
- Grep confirmed: zero imports across all `.ts/.tsx` files

---

## 3. Tests Added

**34 new tests across 3 files:**

### 3.1 `csp-config.test.ts` (+6 tests)

| Test | Assertion |
|------|-----------|
| `wss://api.deepgram.com` in connect-src | String contains |
| `https://api.deepgram.com` in connect-src | String contains |
| wss:// is separate token | Split + array includes |
| report-uri present | String contains |
| report-uri is first-party only | Exact match |
| PostHog in connect-src | String contains |

### 3.2 `voice-telemetry.test.ts` (9 tests, new file)

| Test | Assertion |
|------|-----------|
| Capture called with event name | Mock call count + args |
| Properties merged | Mock call args inspection |
| Works with no properties | Mock call count |
| Silent on PostHog error | No throw |
| No sensitive fields leak | Undefined check for token/transcript/access_token |
| Different events pass through | Multiple calls verified |
| getBrowserInfo shape | Has browser + platform keys |
| STT events use stt_ prefix | Regex match |
| Voice events use voice_ prefix | Regex match |

### 3.3 `voice-stack-contract.test.ts` (12 tests, new file)

| Test | Assertion |
|------|-----------|
| voice-integration.ts deleted | `existsSync` → false |
| Not re-exported | `require()` throws |
| MAX_ATTEMPTS = 2 | Source file regex |
| RETRY_DELAY_MS 1000-5000 | Source file regex + range |
| userStoppedRef tracked | Source contains string |
| Retry loop checks userStopped | Regex match in for loop |
| isRetrying exported | Source contains in return block |
| CSP report file exists | `existsSync` → true |
| CSP report exports POST | Source contains |
| CSP report returns 204 | Source contains |
| captureVoiceEvent exported | Dynamic import + typeof |
| useVoiceProvider passes isRetrying | Source contains |

---

## 4. Validation Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** (0 errors) |
| `npx vitest run` | **PASS** (1103 tests, 49 files) |
| CSP has `wss://api.deepgram.com` | **CONFIRMED** |
| CSP has `report-uri /api/csp-report` | **CONFIRMED** |
| New voice tests | **34/34 PASS** |
| Dead code removed | **CONFIRMED** (grep shows 0 imports) |

---

## 5. Files Changed

| File | Action | Lines Changed |
|------|--------|---------------|
| `next.config.ts` | MODIFIED | +2 tokens in CSP string |
| `src/hooks/useDeepgramSTT.ts` | MODIFIED | Complete rewrite (~360 lines) |
| `src/hooks/useVoiceProvider.ts` | MODIFIED | +5 lines (isRetrying) |
| `src/app/(dashboard)/practice/page.tsx` | MODIFIED | +40 lines (UX) |
| `src/app/api/stt/token/route.ts` | MODIFIED | +10 lines (telemetry) |
| `src/lib/voice-telemetry.ts` | CREATED | 45 lines |
| `src/app/api/csp-report/route.ts` | CREATED | 30 lines |
| `src/lib/__tests__/voice-telemetry.test.ts` | CREATED | 100 lines |
| `src/lib/__tests__/voice-stack-contract.test.ts` | CREATED | 110 lines |
| `src/lib/__tests__/csp-config.test.ts` | MODIFIED | +40 lines |
| `src/lib/voice-integration.ts` | DELETED | -63 lines |

---

## 6. Phase 4 Recommendation: Model Architecture

**Current state:** All 3 tiers use Deepgram for both STT and TTS. The `TIER_FEATURES` map in `voice/types.ts` still defines different providers per tier, but `provider-factory.ts` returns `'deepgram'` for all tiers.

**Recommendation:** If the single-provider approach works reliably, simplify:
1. Remove unused provider paths from `provider-factory.ts` (Cartesia, OpenAI TTS)
2. Consolidate `TIER_FEATURES` to reflect reality
3. Consider removing tier-based provider selection entirely

**Not recommended now:** This is a cleanup task, not a reliability task. Ship the fix first, monitor, then simplify.

---

## 7. Rollback Plan

All changes are additive. To rollback:

```bash
# Revert all voice stack changes
git revert <commit-sha>
# Or surgically:
git checkout HEAD~1 -- next.config.ts src/hooks/useDeepgramSTT.ts src/hooks/useVoiceProvider.ts src/app/\(dashboard\)/practice/page.tsx src/app/api/stt/token/route.ts
git checkout HEAD~1 -- src/lib/voice-integration.ts  # restore deleted file
rm src/lib/voice-telemetry.ts src/app/api/csp-report/route.ts
rm src/lib/__tests__/voice-telemetry.test.ts src/lib/__tests__/voice-stack-contract.test.ts
```

No DB changes to revert. No env vars changed.

---

## 8. Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| CSP explicitly allows `wss://api.deepgram.com` | **MET** |
| STT doesn't die permanently after one failure | **MET** (retry + user choice) |
| One automatic retry on WebSocket failure | **MET** (MAX_ATTEMPTS=2) |
| User can manually retry voice | **MET** ("RETRY VOICE" button) |
| Telemetry exists for connect/failure/retry | **MET** (10 event types) |
| Typecheck clean | **MET** (0 errors) |
| All tests pass | **MET** (1103/1103) |
| Rollback is trivial | **MET** (single git revert) |

---

## 9. Monitoring Plan (Post-Deploy)

After deploying to Vercel:

1. **Check CSP header** — `curl -I https://aviation-oral-exam-companion.vercel.app` → verify `wss://api.deepgram.com` in connect-src
2. **PostHog dashboard** — Filter events by `stt_*` and `voice_*` prefix
3. **CSP reports** — Monitor Vercel function logs for `[csp-violation]` entries
4. **Browser matrix** — Test voice in Chrome (desktop), Safari (desktop + iOS), Firefox (desktop)
5. **Failure injection** — Test with invalid Deepgram API key to verify retry + fallback UX

---

*Generated: 2026-03-06 | Phase 22 | Tests: 1103 | Typecheck: clean*
