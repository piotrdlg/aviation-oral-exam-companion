# 67 — Voice Stack Phase 3: Production Validation Report

**Date:** 2026-03-06
**Commit:** `12a726e6f61378db0fdd6704ee586026d7f10e37`
**Deployment:** `dpl_9XqyFgxSRRTmpzCze2kh5WVSw2w7`
**Production URL:** https://aviation-oral-exam-companion.vercel.app
**Custom Domains:** heydpe.com, heydpe.ai

---

## 1. Executive Summary

Phase 2 voice-stack remediation (CSP hardening, STT retry, telemetry, dead code removal) was deployed directly to production and validated. The app is not live to real users, so production is the proving ground.

**All server-side checks PASS.** Browser-level voice testing (microphone, WebSocket, retry/fallback UX) requires manual authenticated session — documented in the manual testing runbook below.

**Verdict: REVIEW** — server infrastructure is GO, but browser-level voice functionality has not been proven in a live authenticated session yet. See Section 10.

---

## 2. Verified Deployed State

| Item | Value |
|------|-------|
| Branch | `main` |
| Voice-stack commit | `4810073` |
| Deploy commit | `12a726e` |
| Build status | READY (42s, Turbopack, 0 errors) |
| Framework | Next.js 16.1.6 |
| Region | iad1 (US East) |
| Rollback candidate | `dpl_5fE1879ATZYFKmWEb44wwXwL2WAJ` (commit `872b26f`) |

---

## 3. Deployment Evidence

- Build: Compiled in 6.7s, 101 static pages generated
- No build errors
- Only pre-existing warnings: middleware deprecation, edge runtime
- All lambdas deployed (7 Node.js functions)

---

## 4. Live CSP Header Verification

**Evidence (curl -I on both aviation-oral-exam-companion.vercel.app and heydpe.com):**

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'
  https://js.stripe.com https://www.googletagmanager.com https://us.i.posthog.com
  https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:
  https://auth.heydpe.com; font-src 'self' data:; connect-src 'self' https://auth.heydpe.com
  https://api.stripe.com https://us.i.posthog.com https://www.google-analytics.com
  https://api.cartesia.ai https://api.deepgram.com wss://api.deepgram.com https://api.openai.com;
  frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'; report-uri /api/csp-report
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
```

| Requirement | Present | Verdict |
|-------------|---------|---------|
| `https://api.deepgram.com` in connect-src | YES | PASS |
| `wss://api.deepgram.com` in connect-src | YES | PASS |
| `report-uri /api/csp-report` | YES | PASS |
| No wildcard in connect-src | Correct | PASS |
| Consistent across both domains | YES | PASS |

---

## 5. Browser/Device Matrix Results

### Server-Side Verified

| Route | Status | Expected | Verdict |
|-------|--------|----------|---------|
| `/` (landing) | 200 | 200 | PASS |
| `/practice` | 307 → login | 307 | PASS |
| `/api/stt/token` | 401 | 401 | PASS |
| `/api/stt/test` | 401 | 401 | PASS |
| `/api/csp-report` | 204 | 204 | PASS |

### Browser Matrix — PENDING MANUAL VERIFICATION

| Browser / OS | Voice init | Token request | WS connect | Retry | First transcript | TTS | Verdict |
|-------------|-----------|---------------|------------|-------|-----------------|-----|---------|
| Chrome desktop | ? | ? | ? | ? | ? | ? | PENDING |
| Edge desktop | ? | ? | ? | ? | ? | ? | PENDING |
| Safari desktop | ? | ? | ? | ? | ? | ? | PENDING |
| Firefox desktop | ? | ? | ? | ? | ? | ? | PENDING |
| iPhone Safari | ? | ? | ? | ? | ? | ? | PENDING |
| Android Chrome | ? | ? | ? | ? | ? | ? | PENDING |

---

## 6. Failure Injection Results

### Server-Side CSP Report Robustness (VERIFIED)

| Test | Input | Status | Verdict |
|------|-------|--------|---------|
| Standard CSP report | Valid csp-report JSON | 204 | PASS |
| Report-to format | type=csp-violation JSON | 204 | PASS |
| Empty body | `{}` | 204 | PASS |
| Malformed body | Invalid JSON string | 204 | PASS |

### Browser-Side Failure Injection — PENDING MANUAL

| Scenario | Expected behavior | Verified |
|----------|------------------|----------|
| Network interrupt before WS | Retry once after 2s | PENDING |
| Connect failure → automatic retry | isRetrying=true, 2s delay, second attempt | PENDING |
| Second failure → user choice | Show "Retry Voice" and "Text Only" buttons | PENDING |
| Manual "Retry Voice" click | New connection attempt | PENDING |
| "Text-only mode" click | Voice disabled, text input active | PENDING |
| No infinite retry loop | MAX_ATTEMPTS=2 enforced | PENDING |
| User stop → no auto-retry | userStoppedRef prevents retry | PENDING |

---

## 7. Telemetry Verification

### CSP Reporting (VERIFIED)

- `/api/csp-report` endpoint: LIVE, accepts POST, returns 204
- Server logs: `[csp-violation]` warnings appear in Vercel runtime logs
- 4/4 test reports logged successfully

### PostHog Telemetry — PENDING

Events implemented in code but not yet triggered in production (requires authenticated voice session):
- `stt_token_request_started` — client-side (useDeepgramSTT)
- `stt_token_request_succeeded` — server-side (token route)
- `stt_token_request_failed` — server-side (token route)
- `stt_websocket_connect_started` — client-side
- `stt_websocket_connected` — client-side
- `stt_websocket_failed` — client-side
- `stt_websocket_closed` — client-side
- `voice_retry_attempted` — client-side
- `voice_auto_disabled` — client-side (removed in Phase 2)
- `voice_retry_clicked` — client-side (practice page)

---

## 8. CSP Report Verification

| Check | Result |
|-------|--------|
| Endpoint live | YES — `/api/csp-report` returns 204 |
| Standard CSP report format | Accepted |
| Report-to format | Accepted |
| Malformed input | Gracefully handled (204, no crash) |
| Server-side logging | `[csp-violation]` in Vercel runtime logs |
| No secrets in logs | Correct — only violated_directive, blocked_uri, document_uri, disposition |

---

## 9. `/api/stt/test` Assessment

**Current usefulness:** HIGH

The endpoint performs 4 diagnostic steps:
1. Auth check (rejects unauthenticated requests)
2. Deepgram auth/grant token generation (tests API key validity + JWT issuance)
3. SDK direct connection test (WebSocket from server with API key)
4. SDK with access token test (WebSocket from server with JWT)

**Fields returned:** apiKeyPrefix, apiKeyLen, authGrant status/ms/tokenLen, sdkDirectKey connected/events/ms, sdkWithAccessToken connected/events/ms

**Missing fields:** None critical. Could add: Deepgram API version, account plan info.

**Security:** Requires auth. API key prefix exposed (first 8 chars) — acceptable for admin diagnostic. No full secrets in response.

**Verdict:** Sufficient for ongoing ops. No changes needed.

---

## 10. Production Rollout Verdict

### **REVIEW**

**Rationale:** All server-side infrastructure is verified and functioning correctly. However, the core user-facing functionality (voice mode in browser) has not been tested in a live authenticated session because browser automation was unavailable during this validation sprint.

### GO criteria assessment:

| Criterion | Status |
|-----------|--------|
| 1. CSP header correct live | **GO** |
| 2. Chrome desktop end-to-end | **PENDING** |
| 3. Safari desktop or iPhone | **PENDING** |
| 4. Firefox/Edge understood | **PENDING** |
| 5. Retry/fallback works | **PENDING** (code verified, not runtime-tested) |
| 6. PostHog telemetry visible | **PENDING** |
| 7. CSP reporting functional | **GO** |
| 8. No high-severity blocker | **GO** (zero runtime errors) |

### To upgrade to GO:

Complete the manual browser testing runbook below (Section 14). If Chrome desktop voice works end-to-end, verdict upgrades to GO.

---

## 11. Issues Found and Fixes Applied

| Issue | Severity | Fix | Status |
|-------|----------|-----|--------|
| Cartesia env var not needed | LOW | Noted — CSP still includes it for TTS backward compat | No action needed |
| DEEPGRAM/PostHog not in Preview env | INFO | Not relevant — testing directly in production | N/A |

No code fixes were needed in this phase. All Phase 2 code deployed cleanly.

---

## 12. Residual Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Browser WebSocket behavior untested | MEDIUM | Manual testing runbook provided |
| Safari WebSocket + CSP interaction | LOW | `wss://` explicitly in CSP; Safari >= 15.4 supports CSP Level 3 |
| Firefox no MediaRecorder Opus support | LOW | Known limitation, documented since Phase 1 |
| PostHog events not yet confirmed in dashboard | LOW | Code review confirms correct instrumentation |
| Cartesia in CSP but not in use for STT | NONE | Harmless — used for TTS, not STT |

---

## 13. Rollback Plan

**Instant rollback via Vercel:**
```bash
# Rollback to previous production deployment (pre-Phase 2)
vercel rollback dpl_5fE1879ATZYFKmWEb44wwXwL2WAJ --team team_ceX4QNtqeodqq5DbxtPjI2NY
```

**Or via git:**
```bash
git revert 4810073 12a726e  # Revert both Phase 2 commits
git push origin main
```

**Rollback is trivial** — all changes are additive. No database migrations. No breaking API changes.

---

## 14. Manual Browser Testing Runbook

### Prerequisites
- Login to https://aviation-oral-exam-companion.vercel.app with a Tier 2+ account
- Navigate to `/practice`
- Select a rating and start exam

### Test 1: Chrome Desktop Voice (CRITICAL)
1. Click voice/microphone button
2. Grant microphone permission
3. Speak a response
4. **Verify:** Transcript appears in real-time (interim + final)
5. **Verify:** TTS plays examiner response
6. **Check DevTools Console:** Look for `stt_token_request`, `stt_websocket_connected` events
7. **Check DevTools Network:** `/api/stt/token` returns 200, `wss://api.deepgram.com` WebSocket opens

### Test 2: Retry Behavior
1. Open DevTools Network tab
2. Start voice mode
3. In DevTools, throttle network to "Offline" briefly during WebSocket connection
4. **Verify:** "Retrying..." indicator appears
5. **Verify:** After restoring network, second attempt connects
6. **Verify:** If both fail, "Retry Voice" and "Text Only" buttons appear

### Test 3: User Stop Prevention
1. Start voice mode
2. Click stop/mute button
3. **Verify:** No auto-retry triggered (userStoppedRef prevents it)

### Test 4: Text-Only Fallback
1. Trigger voice failure (deny microphone permission or use Firefox)
2. **Verify:** Text input remains usable
3. **Verify:** Full exam flow works without voice

### Test 5: PostHog Verification
1. After completing Tests 1-4
2. Log into PostHog dashboard
3. Search for events: `stt_token_request_succeeded`, `stt_websocket_connected`
4. **Verify:** Events appear with correct properties (tier, session_id, no secrets)

### Test 6: CSP Violation Monitoring
1. Check Vercel runtime logs for `[csp-violation]` entries
2. If any appear during testing, document the blocked URI and directive

---

## Commands Run

```bash
# Deploy
git add [14 voice-stack files]
git commit -m "fix(voice): Phase 2 voice-stack remediation..."
git add [21 script restructuring files]
git commit -m "chore: restructure scripts..."
git push origin main

# Verify routes
curl -s -o /dev/null -w "%{http_code}" https://aviation-oral-exam-companion.vercel.app/
curl -s -o /dev/null -w "%{http_code}" https://aviation-oral-exam-companion.vercel.app/practice
curl -s -o /dev/null -w "%{http_code}" https://aviation-oral-exam-companion.vercel.app/api/stt/token
curl -s -o /dev/null -w "%{http_code}" https://aviation-oral-exam-companion.vercel.app/api/stt/test
curl -s -o /dev/null -w "%{http_code}" -X POST https://aviation-oral-exam-companion.vercel.app/api/csp-report

# Verify CSP headers
curl -sI https://aviation-oral-exam-companion.vercel.app/ | grep content-security-policy
curl -sI https://heydpe.com/ | grep wss://api.deepgram.com

# CSP report robustness tests (4 variants)
curl -X POST .../api/csp-report -d '{"csp-report":{...}}'  # Standard
curl -X POST .../api/csp-report -d '{"type":"csp-violation",...}'  # Report-to
curl -X POST .../api/csp-report -d '{}'  # Empty
curl -X POST .../api/csp-report -d 'invalid'  # Malformed
```
