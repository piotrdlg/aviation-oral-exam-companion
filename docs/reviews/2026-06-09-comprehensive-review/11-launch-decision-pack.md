# Launch Decision Pack — HeyDPE

> **Purpose:** a single 15-minute read that lets Piotr make the GO / NO-GO call on
> *unrestricted commercial marketing* for the HeyDPE web app. Everything here
> traces to evidence in this review folder, the master plan task statuses, or the
> final gate result.
>
> **Date:** 2026-06-11 · **Author:** Fable 5 (W7.2) · **Depends on:** W7.1 gate (PASS, 15/15 blockers)

---

## 1. Executive verdict

### 🟢 GO — with two small owner actions, neither of which blocks turning on traffic.

The 8-phase remediation program (Phases 0–6 + 6B) is complete and deployed. The
final launch gate passes **15/15 blockers** against live production. Every
critical and high finding from the comprehensive review (exam engine, voice,
Stripe, security) has a closing task that shipped and is verified. The 3 paying
users are intact throughout.

**The three strongest reasons it's a GO:**

1. **The exploitable security holes are closed and *proven closed against
   production*** — not just in code. The gate's live probes confirm: an
   authenticated user cannot read another user's exam scores (R06 C1), anon
   cannot read instructor PII (R06 C2), and the exam route rejects another
   user's `sessionId` with a 404 before any write (R06 C3).
2. **The exam engine — the product — is correct and regression-guarded.** The
   root-cause refactor (server-owned state, W2.1) plus 20 confirmed-bug fixes
   are locked in by a CI regression harness that drives a *full simulated exam*
   through the real routes every push. Grading is deterministic, ≤100%, and
   consistent between badge and modal.
3. **Money is enforced without breaking the payers.** Webhook ordering, dunning
   grace, price→tier mapping, and anti-re-trial all ship; quotas are real
   (chars summed, not rows) and seeded log-only for a safe soft landing; Stripe
   Tax is wired behind a flag. The one canceling user (effective July 2) is a
   live test case the W3.1 logic handles correctly.

**The two owner actions (do them this week; they don't gate traffic):**

- **Set `SENTRY_DSN` in Vercel production.** Sentry is wired (W6.1) but a no-op
  until the DSN is set — the gate's only WARN. Until then, errors aren't paged.
- **Decide on the engagement problem (below).** This is a *business* signal, not
  a technical blocker, but it's the single most important number on this page.

> ⚠️ **The non-technical headline the owner must not miss:** per ground truth §6,
> the entire user base — including all 3 paying clients — has run **zero exams in
> the ~3 weeks before this review**, and one client cancels July 2. The app is
> now technically launch-ready; **churn/engagement is the real risk to revenue,
> and no amount of remediation fixes it.** Marketing spend on top of an unproven
> retention curve is the thing to be cautious about — not the code.

---

## 2. Fixed-and-verified

Every critical/high finding → the task that closed it → how it's verified.
"Gate #n" = a check in `10-final-gate-result.md`. "Test" = a named unit/route
test in the 1,354-test suite. "Live" = probed against production.

### Security (review 06)

| Finding | Closing task | Verification |
|---|---|---|
| **C1** — any authenticated user reads any user's scores via RPC | W1.1 | Gate #10 (live: ephemeral user → `forbidden`); `scripts/audit/test-rpc-authorization.ts`; migration `20260610000001` |
| **C2** — anon reads instructor certificate_number/admin_notes | W1.2 | Gate #11 (live: anon denied; safe view serves); `test-instructor-pii-exposure.ts` |
| **C3** — exam route writes any `sessionId` (IDOR) | W1.3 | Gate #12 + `idor-session-ownership.test.ts` ("404 for another user's sessionId, before any service-role access") |
| **M1** — `PLAYWRIGHT_TEST` global auth bypass | W1.4 | env-gated to non-prod; route test |
| **M2** — fail-open cron auth | W1.4 | cron routes fail closed on missing `CRON_SECRET` |
| **M3** — in-memory rate limiter ineffective on serverless | W1.4 | Upstash sliding-window; load test showed clean 429s at 50 VUs |

### Exam engine & grading (review 02 — 20 confirmed bugs)

| Finding cluster | Closing task | Verification |
|---|---|---|
| Client-authoritative state; planner never advanced; exams pinned to task 1 (bugs 1–4, A, B) | **W2.1** | Gate #15 + `exam-flow-regression.test.ts` (advancement across tasks, natural completion, write integrity) |
| One bad element code destroys an exchange; infra failure awards 70%; transcript lost on assessment fail (bugs 6–8, C, E) | W2.2 | unit tests: bad score → `ungraded`, decoupled writes |
| Grading split-brain, >100% scores, INCOMPLETE-for-completed, mention credit on wrong answers (bugs 9, 11–13, 19, 20) | W2.3 | property test (score ≤100%); golden-path determinism test |
| Resume wipes coverage; exchange numbering inconsistent (bugs 10, 14) | W2.4 | resume test (coverage grows, never shrinks) |
| Lifetime view unreachable; stats capped at 20; abandoned counted; flight-only areas in planner (bugs 15–18) | W2.5 | RPC filter migration; oral-area exclusion test |
| Examiner-vs-assessment drift unmeasured (arch risk 2) | W2.6 | `examiner_assessment_mismatch` telemetry + CI harness |

### Voice (review 04)

| Finding | Closing task | Verification |
|---|---|---|
| Fallback chain wrapped import, not the call — runtime 500s skipped the sentence (#3) | W4.1 | `provider-factory.test.ts` (synthesis-time failover) |
| Aviation decimal boundary bug ("121.5." never split) (#5) | W4.1 | `sentence-boundary` tests |
| STT dropped socket = dead mic; Safari hangs (#7, #8) | W4.1 | reconnect + hot-mic-release; Safari probe |
| "Premium voice" claims vs single-provider reality; March-incident dead code (#1, #11–13) | W4.2 (D2: Aura-2) | dead code deleted; claims corrected; contract tests |
| Aviation vocabulary silently disabled; 3 serial DB hits/sentence (#9, #6) | W4.3 | live keyterm handshake; 60s auth/quota cache |

### Stripe / commercialization (review 05 — 18 findings)

| Finding | Closing task | Verification |
|---|---|---|
| Out-of-order webhook guard was a no-op (#5) | W3.1 | Gate #14 + `stripe-webhook.test.ts` (event.created ordering) |
| Infinite re-trials; missing refund/dispute/trial-end; no dunning grace (#6–8, 10) | W3.1 | 10 fixture tests; `has_trialed` anti-re-trial |
| TTS quota counted rows not chars — cap unreachable (#1) | W3.2 | Gate #13 (live: RPC SUM == raw SUM) + migration body sums `quantity` |
| Exam/exchange caps, trial bypass via abandon, STT unmetered (#2, 3, 9, 11, 12) | W3.2 | quota tests; abandoned counts toward the 3-exam limit |
| Pricing page lied about voice/resume (#4); courtesy access granted nothing (#16) | W3.3 | Gate #18 parity matrix; override resolves to `dpe_live` |
| Stripe Tax; live-mode key guard; PII retention (#18) | W3.4 | flag-gated `automatic_tax`; prod-test-key throws at init |

### Operations & compliance (reviews 01/06)

| Item | Closing task | Verification |
|---|---|---|
| No error tracking / no alerting | W6.1 | Sentry wired (env-gated); `/api/health` 503s per-check; ALERTING.md — **DSN not yet set (gate #17 WARN)** |
| Never load tested | W6.2 | 50 VUs, 0 server errors, p95 380ms (`09-load-test-report.md`) |
| No GDPR export/delete (also Apple requirement) | W6.3 | `/api/user/export` + `/api/user/delete`; live-verified 0 residual rows across 21 tables |
| 11 funnel events missing; docs lied | W6.4 | events in PostHog; CLAUDE.md truth pass |
| No FAA disclaimer / accessibility / consent record | W6.5 | first-exam disclaimer (server-recorded); `/accessibility`; `consent_records` |
| Knowledge graph unproven in runtime (D4) | W5.1–W5.6 | graph removed; Scenario Engine **Gate 1 PASS 90.0%**; gated at `ab` for Gate 2 |

---

## 3. Accepted risks register

Things deliberately deferred or left as-is, each with what would make us revisit.

| Risk | Why accepted | Revisit trigger |
|---|---|---|
| **Quota hard-enforcement seeded OFF** (`quota.*_hard_enforce`) | Soft launch: log-only one week to catch false positives before cutting anyone off (D1) | Flip to enforce after reviewing PostHog `*_logonly` events; before any large traffic push |
| **`SENTRY_DSN` not set in prod** | Sentry code is wired and inert; owner must create the project/DSN | **Do before launch** — until then no error paging (gate #17 WARN) |
| **`pg_cron` not enabled in prod** | Session-lifecycle + retention crons aren't running; trial expiry is covered by request-time `expires_at` enforcement | Enable Extensions → pg_cron and re-run schedule blocks (`runbooks/DATABASE.md`) |
| **Scenario Engine at `ab`, not `on`** | Gate 1 passed (90.0%); Gate 2 is a live A/B with guardrails before full rollout | Enable `on` only after the W5.6 A/B clears its guardrails (`SCENARIO-ROLLOUT.md`) |
| **Stay on Aura-2, not ElevenLabs** (D2) | EL adds $4.35–$7.62/payer/mo (26–34% of revenue) with unproven conversion lift | A/B shows ≥2pp conversion uplift, OR enterprise rate ≤$0.040/1K, OR mobile launch within ~2 quarters |
| **`dpe_live/none` anomaly** (1 user, top tier, no Stripe sub) | Likely owner comp/test account; changing a live tier needs owner confirmation | Owner confirms intent; reconcile if unexpected |
| **Heavy users unprofitable until prompt caching matures** | Prompt caching shipped (W5.2: ~1,100 cached tokens read/call); blended LLM still ≈ the dominant COGS | Quarterly economics review; cap tuning if whales appear |
| **STT/Flux + adjacency ordering flags OFF** | Pilots behind flags; not load-bearing for launch | Owner enables per the respective runbooks when ready |

---

## 4. Capacity & unit economics

**Safe concurrent users (infra):** **50+ concurrent users** with zero server
errors and p95 380ms (`09-load-test-report.md`). The app's own infrastructure
(Vercel functions + Supabase pooler + RAG retrieval + DB write chain) does not
degrade at 50 VUs. The **first failure mode is the per-user rate limiter shedding
load with clean 429s — never a crash.** The real-world ceiling for *complete
exchanges* is bounded by Anthropic API concurrency and the per-user rate limit,
not by app infrastructure, which has ample headroom underneath.

**Cost per active paying user / month (Aura-2, post-W3.2 enforcement):**

| Component | Estimate | Source |
|---|---|---|
| Voice COGS (blended, excl. trials) | **$5.72** | `12-voice-economics-d2.md` §3.2 (Aura-2) |
| LLM COGS (blended, uncached upper bound) | ≈ **$15.85** | review 03 / D2 §3.3 — prompt caching (W5.2) reduces this in practice |
| Trial voice cost (CAC, not COGS) | ≈ **$1.30** per 3-exam trial | D1 sizing (35K char cap) |

**Gross-margin sanity vs pricing ($39/mo, $24.92 annual-effective):** light and
medium archetypes are comfortably positive on Aura-2; **the heavy/"whale"
archetype is margin-negative even on Aura-2** (LLM-dominated, ~$72/mo LLM at the
extreme). This is acceptable at current scale (cap-bounded worst case ≈ break-even
on TTS) but is the reason D2 chose the *cheaper* voice — there is no margin slack
to spend on premium TTS. **Implication for marketing:** acquisition is safe at
current pricing for typical usage; watch for a cluster of heavy daily users, who
are the only unit-economics risk.

---

## 5. The 5 operational rituals (the standing process post-launch)

1. **Final gate before every traffic push** — `npm run audit:final-gate` (live).
   Blockers must be green; resolve WARNs or accept them explicitly.
   `runbooks/FINAL-GATE.md`.
2. **Sentry triage** — once `SENTRY_DSN` is set: new-issue + error-rate-spike
   alerts to pd@imagineflying.com; triage daily during ramp. `runbooks/ALERTING.md`.
3. **Stripe dashboard weekly** — watch the July 2 cancellation downgrade cleanly;
   confirm refund/dispute/trial-end events are subscribed; reconcile the
   `dpe_live/none` anomaly.
4. **`eval:exam-flow` in CI** — the exam-flow regression harness runs every push;
   a red run means the engine regressed — do not deploy.
5. **Voice/LLM economics quarterly** — re-run the D2 framing as usage grows;
   re-tune caps and revisit the Aura-2-vs-EL decision against its flip conditions.

---

## 6. What this pack does NOT cover

- **Mobile (Phase 8)** — M1/M2 specs and the M3 voice spike are a separate track
  gated after this web launch gate; not required for the web GO.
- **The engagement/churn problem** — flagged in §1 as the real revenue risk. It is
  a product/marketing question, not a remediation item, and is out of scope for
  this technical decision pack. **It should drive the *pace* of marketing spend
  even though it does not change the *technical* GO.**

---

### Bottom line

**Technically: GO.** Set `SENTRY_DSN`, flip quota enforcement after the log-only
week, and the web app is cleared for commercial marketing at the load levels
measured. **Commercially: scale spend against proven retention, not ahead of it** —
the zero-exam-in-3-weeks signal is the thing to watch, not the code.
