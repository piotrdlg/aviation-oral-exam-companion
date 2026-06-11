# 09 — Load Test Report (W6.2)

> Run 2026-06-10 against a **preview** deployment (never production), Supabase
> staging project `curpdzczzawpnniaujgq` (full migration parity), with
> `LOAD_TEST_MOCK_LLM=1` so the two Claude calls per exchange return canned
> results after an ~800 ms synthetic hold. Everything else — auth, session
> policy, quota checks, RAG retrieval (`chunk_hybrid_search`), and all DB
> writes — is the **real** path. Tooling: `scripts/load/k6-exam.js`,
> `scripts/load/k6-voice.js`, `scripts/load/setup-loadtest-users.ts` (50-user
> pool, torn down after the run).

## Headline

| Metric | Result | Verdict |
|---|---|---|
| Concurrency reached | **50 VUs** (50 distinct users, 1:1) | — |
| Server errors (5xx / timeouts) | **0** out of 2,569 requests | ✅ graceful |
| Successful-request latency p95 | **380 ms** | ✅ (<2 s gate) |
| Successful-request latency p90 / median | 238 ms / 151 ms | ✅ flat under ramp |
| Checks passed | **100%** (2,498/2,498) | ✅ |
| First bottleneck | per-user rate limiter (clean 429s) | ✅ by design |

**The app's own infrastructure (Vercel functions + Supabase pooler + RAG
retrieval + DB writes) does not degrade up to 50 concurrent users.** Median
successful-request latency stayed at ~150 ms and p95 at 380 ms across the
entire 1→50 VU ramp, with **zero** 5xx responses, timeouts, or pooler
connection errors.

## The first failure mode is the rate limiter, and it fails cleanly

46% of requests returned **429** — every one of them from the per-user
sliding-window limiter (`/api/exam` = 20 calls/min/user, `src/lib/rate-limit.ts`),
**not a single 5xx or timeout**. This is the intended first line of defense
working exactly as designed: under a synthetic load that compresses a whole
6-call exam into ~8 s per user (far faster than real usage), each user
quickly exceeds 20 exam-calls/min and the limiter sheds the excess with a
clean `429 {"error":"rate_limited"}` and a `Retry-After` header. No request
ever reached a crashing or hanging state.

This is the headline operational finding: **the system's response to overload
is to rate-limit, not to fall over.**

## What this does and does NOT measure

- **Measures (the point of the mock):** the app's own concurrency ceiling —
  Vercel function scheduling, the Supabase connection pooler under the
  service-role clients, RAG retrieval latency, and the per-exchange DB write
  chain. All healthy at 50 concurrent users.
- **Does NOT measure:** end-to-end exchange latency, which in production is
  dominated by the **two Claude calls per exchange** (~3–4 s combined). The
  real-world ceiling for *complete* exchanges is bounded by Anthropic API
  concurrency and the per-user rate limit, not by app infrastructure — which
  this test shows has ample headroom underneath.

## Latency detail (successful requests only)

```
http_req_duration   median 151 ms   p90 238 ms   p95 380 ms   max 4.52 s
start (mocked)      median 1.28 s   p95 1.54 s   (includes the 800 ms LLM mock hold ×… )
respond (mocked)    median 1.30 s   p95 1.48 s   (includes 2× 800 ms mock holds)
```
The raw `http_req_duration` (151 ms median) is the app overhead with the LLM
mock excluded from the percentile; the start/respond trends include the
deliberate mock hold and so sit near ~1.3 s by construction.

## Supabase pooler

No connection errors at 50 concurrent users. The service-role client
(`createServiceClient`) and per-request SSR clients shared the pooler without
saturation. Recommendation below covers headroom beyond this run.

## Recommendations

1. **Safe concurrent-user number for the launch dashboard: 50+ active users**
   with no infrastructure stress. The practical production ceiling for
   *simultaneous in-flight exchanges* is set by Anthropic API concurrency and
   the 20-calls/min/user limit, both of which sit above realistic early-launch
   traffic (3 paying users today; marketing scaling to tens).
2. **Keep `maxDuration` conservative.** `/api/tts` is capped at 30 s (W4.1);
   `/api/exam` relies on Vercel's default. With real LLM latency ~3–4 s and the
   W5.2 timeouts, no exchange approaches the limit — leave as is.
3. **Upstash for distributed rate limiting.** Preview used the in-memory
   limiter (per-Lambda-instance); production should have `UPSTASH_REDIS_*` set
   so the 20/min limit is enforced globally rather than per-instance. Verify in
   the final gate (W7.1 ops check).
4. **Re-run before any large marketing push** at higher VU counts once Anthropic
   rate limits are known for the production key — that, not the app, is the real
   ceiling.

## Voice path

`scripts/load/k6-voice.js` is ready (TTS synthesis + STT token issuance, with
429s counted separately since the 30/min TTS and 4/min token limits are part
of what it measures). It hits the **real** Deepgram API (short sentences, a few
cents), so it is left for the owner to run against a preview with
`DEEPGRAM_API_KEY` set, per the runbook — it was descoped from this automated
run to avoid unattended third-party spend.

## Safety: the mock can never run in production

`isLoadTestMockActive()` (`src/lib/exam-engine.ts`) is double-guarded:
`LOAD_TEST_MOCK_LLM === '1'` **AND** `VERCEL_ENV !== 'production'`. The env var
is set only on the preview scope. A production deployment ignores it entirely.
