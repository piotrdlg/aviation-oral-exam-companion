# Review 05 — Stripe & Commercialization Readiness

> Date: 2026-06-09 · Reviewer: AI agent (payments audit)
> Scope: stripe.ts, /api/stripe/*, subscription_events, tier-lookup, usage quotas, pricing page, entitlement overrides
> **Production constraint: two paying users exist; nothing may break them.**

## Confirmed gaps/bugs

### 1. TTS monthly character quota counts *requests*, not characters — quota effectively never enforced
- `src/app/api/tts/route.ts:72-78` vs `src/lib/voice/usage.ts:47` — **HIGH (cost exposure)**
- Row count of `tts_request` log rows is passed as `ttsCharsThisMonth`. Characters are in `quantity` but never summed. With the 500K-char cap, a user needs 500K *requests* to be blocked; each request synthesizes up to 2,000 chars. Fix: sum `quantity` via RPC; fix the off-by-one `>` → `>=` at `usage.ts:47`.

### 2. No tier/quota enforcement on `/api/exam` — free users get unlimited Claude calls
- `src/app/api/exam/route.ts` (no `checkQuota` import; only kill-switch + `getUserTier` at :295-297); documented open in doc 40:145 — **HIGH (cost exposure)**
- `maxExchangesPerSession` (30 free / 50 paid) never checked server-side. `respond` doesn't verify session ownership, status, tier, or trial state — and `sessionId` is optional (enforcement skipped when absent, `exam/route.ts:337-339`). Each respond = two Claude calls. Rate limiter is in-memory per-Lambda ("should not be relied upon for billing enforcement", `rate-limit.ts:7-8`). Fix: require `sessionId`, load session server-side, reject `status != 'active'`, enforce exchange caps and trial state.

### 3. Free-trial limit (3 exams) bypassable by marking sessions `abandoned`
- `src/app/api/session/route.ts:69` (count excludes `.neq('status','abandoned')`) + `:115-123, 221-225` (client-supplied `status` written unvalidated) — **HIGH (abuse vector)**
- Free user finishes exam #3, marks old sessions `abandoned`, creates exam #4 — forever. Fix: server-only `abandoned` transition, or count abandoned toward the limit, or count lifetime sessions created.

### 4. Pricing page advertises gates that aren't enforced (voice + session resume free)
- `src/app/pricing/page.tsx:78,80` vs `src/lib/voice/usage.ts:63-65` (`hasTtsAccess` blocks only `'ground_school'`) and migration `20260218000001_simplify_voice_tiers.sql` (free default tier is now `checkride_prep`) — **HIGH (product integrity + cost)**
- Every free signup is `checkride_prep` → `hasTtsAccess()` true for everyone — free users get the advertised paid voice feature. Session resume has no tier check either. Doc 44:94 flagged this as "acceptable for beta". Fix: decide real free-tier semantics; gate on `subscription_status in ('active','trialing')` or fix pricing copy.

### 5. Out-of-order webhook guard compares *processing* time, not Stripe `event.created` — guard is a no-op
- `src/app/api/stripe/webhook/route.ts:212, 244, 280, 309` (`const eventTs = new Date().toISOString()`) used in `.or('last_webhook_event_ts.is.null,last_webhook_event_ts.lt.${eventTs}')` at `:239, :263, :304, :323` — **MEDIUM-HIGH**
- Every later-*delivered* event passes regardless of creation order. Scenario: `invoice.payment_failed` at 10:00 → downgrade; a stale `customer.subscription.updated` (active, created 9:55) retried at 10:05 → user flips back to `dpe_live` despite failed payment. Fix: store/compare `event.created`. **Backfill required — see migration safety.**

### 6. Infinite free trials on re-subscribe
- `src/app/api/stripe/checkout/route.ts:57` (`trial_period_days: 7` unconditional) — **MEDIUM**
- Subscribe → cancel day 6 → re-subscribe → new trial, forever. Fix: check prior subscriptions (`subscriptions.list({customer, status:'all'})` or `has_trialed` flag) and omit trial for returning customers.

### 7. No refund/dispute/trial-end webhook handlers
- `webhook/route.ts:65-81` — only 5 events handled. No `charge.refunded`, `charge.dispute.created`, `customer.subscription.trial_will_end` — **MEDIUM**
- Terms promise 7-day refund (`terms/page.tsx:188-193`). Dashboard refund without cancel → user keeps access; chargeback never downgrades or alerts. Fix: add handlers (downgrade + admin alert; trial reminder per #10).

### 8. First failed payment instantly downgrades to free tier — no grace period
- `webhook/route.ts:307-323` (sets `tier:'checkride_prep'` on `invoice.payment_failed`); `handleSubscriptionUpdated` maps any non-active/trialing status to `checkride_prep` (`:214-216`) — **MEDIUM (paying-customer experience)**
- Card expires → first Smart Retry failure cuts to free tier immediately though Stripe retries ~2 weeks. Fix: keep tier while `past_due` until `current_period_end` + grace; hard-cut on `deleted`/`unpaid`.

### 9. STT usage is unmetered — no monthly cap exists in code
- `usage.ts:16-57` — no STT branch (`sttSecondsThisMonth` accepted, never read); `stt/token/route.ts` enforces only 4 tokens/min, each a 10-min JWT — **MEDIUM (cost exposure)**
- Fix: STT-seconds branch in `checkQuota`, metered via `usage_logs`, checked at token issuance.

### 10. Trial-ending reminder promised but never sent
- `src/lib/email.ts:113-130` (`sendTrialEndingReminder`) has **zero callers**; no `trial_will_end` webhook case; FAQ promises a reminder (`pricing/page.tsx:49`) — **MEDIUM (FTC negative-option exposure)**
- Fix: handle `customer.subscription.trial_will_end` (fires 3 days before) → send reminder.

### 11. Daily hard caps configured but never enforced
- Migration `20260216100001` seeds `user_hard_caps` (`daily_llm_tokens: 100000` etc.); only consumers are admin config UI + types. No API route reads them — **MEDIUM** (admin "safety valve" is an illusion)

### 12. Free-session `expires_at` written but never enforced
- `session/route.ts:84-103` writes `expires_at` (+7 days); no reader anywhere in src/ — **LOW-MEDIUM**

### 13. `subscription_status` CHECK doesn't cover full Stripe enum → poison webhook
- Migration `20260217100001` allows 7 values; Stripe can send `paused`, `incomplete_expired`. Webhook writes verbatim (`webhook/route.ts:131, 223, 298`) → CHECK violation → event `failed` → Stripe retries forever; tier never updates — **LOW-MEDIUM**

### 14. No Stripe product→tier mapping — any subscription becomes `dpe_live`
- `webhook/route.ts:130` (hardcoded; same `:214-216`, `:290-292`) — **LOW today**, but adding a cheaper plan later silently grants top tier. Fix: single price→tier mapping function used by all handlers.

### 15. Idempotency race window: concurrent duplicate deliveries both process
- `webhook/route.ts:49-61` — on UNIQUE conflict with first attempt still `processing`, second proceeds in parallel. Duplicate emails possible — **LOW**

### 16. Instructor courtesy override is a tier no-op
- `instructor-entitlements.ts:26` (`COURTESY_TIER = 'checkride_prep'`) + `tier-lookup.ts:51` — max(base, courtesy) is correct design, **but** free default tier *is* `checkride_prep`, so courtesy grants nothing. `user_entitlement_overrides.paid_equivalent` is not read by `getUserTier` — a "paid_equivalent" student doesn't get `dpe_live` — **LOW-MEDIUM (program promises vs delivery)**

### 17. Stale-tier window after downgrade (cache)
- `tier-lookup.ts:12` — 5-min in-memory TTL per Lambda; `invalidateTierCache` (`:94`) never called from webhook — **LOW** (acknowledged doc 44:96)

### 18. Minor housekeeping
- Deprecated eager `stripe` export (`stripe.ts:19-24`) is what routes import; missing env → `null as unknown as Stripe` crash with confusing error.
- `subscription_events.payload` stores full Stripe objects incl. customer PII indefinitely — define retention.
- Webhook vs checkout-success race: **handled acceptably** (`status/route.ts:36-66` grants from Stripe directly, doesn't write `last_webhook_event_ts`).

## Commercialization checklist status

| Requirement | Status | Evidence |
|---|---|---|
| Webhook signature verification | Present | `constructEvent`, 400 on failure (`webhook/route.ts:26-34`) |
| Webhook idempotency | Partial | UNIQUE + status machine; concurrent-duplicate window (#15) |
| Event coverage (5 core events) | Present | `webhook/route.ts:65-81` |
| Refund/dispute/trial_will_end events | **Absent** | #7, #10 |
| Out-of-order delivery protection | **Broken** | #5 |
| Cancel = access until period end | Present | `cancel_at_period_end` semantics correct |
| Past-due grace handling | **Absent** | #8 |
| Trial handling | Partial | works; infinite re-trial (#6); no reminder (#10) |
| Server-side session quota (free = 3) | Partial | enforced at creation; bypassable (#3); not re-checked on respond (#2) |
| Server-side exchange caps | **Absent** | #2 |
| Server-side TTS quota | **Broken** | #1 |
| Server-side STT quota | **Absent** | #9 |
| Daily hard caps | **Absent (config only)** | #11 |
| Pricing page matches enforcement | **Mismatched** | #4 |
| Test vs live mode handling | Present (partial) | env-driven; no prod-uses-live-keys guard |
| Stripe Tax / invoicing | **Absent** | no `automatic_tax`/`tax_id_collection` in checkout; FL likely doesn't tax this SaaS but nationwide/EU needs a decision |
| Receipts | Partial | app confirmation email; Stripe receipts depend on dashboard setting |
| Self-serve cancel | Present | billing portal |
| Self-serve refund | Absent (by design) | manual via dashboard; terms promise 7-day refund |
| Quota reset semantics | N/A-ish | calendar-month windows; dpe_live unlimited |
| Revenue/MRR dashboard, alerting | Absent | doc 40 deferred to Stripe Dashboard |

**Verdict:** happy-path revenue loop (checkout → trial → charge → cancel) works, signature-verified, mostly idempotent — fine for two users. **Not ready for full commercialization**: quota enforcement is largely decorative (#1, #2, #3, #9, #11), the paid differentiator is free (#4), dunning/refund/trial-abuse edges open (#5–#8, #10).

## Migration safety notes (two paying users in production)

1. **Out-of-order guard fix (#5) requires backfill.** `last_webhook_event_ts` holds processing wall-clock times (always later than any `event.created`). Switching comparison without reset → next genuine webhook for both payers silently rejected. Sequence: deploy code writing `event.created` to a new column (or `UPDATE user_profiles SET last_webhook_event_ts = NULL WHERE stripe_customer_id IS NOT NULL` in the same release), then enable the guard.
2. **TTS quota fix (#1):** first run `SELECT user_id, SUM(quantity) FROM usage_logs WHERE event_type='tts_request' AND created_at >= date_trunc('month', now()) GROUP BY 1` — confirm both payers under cap or they'd be 429'd mid-month. Consider a log-only week.
3. **Exchange/session caps (#2):** dpe_live cap is 50/session — hard-enforcing could cut a paying user mid-mock-oral. Ship client warning at ~40 and a soft server response before a hard 429.
4. **TTS tier gating (#4):** blocking `checkride_prep` doesn't touch dpe_live payers but instantly cuts instructor-courtesy users and all free users; decide tier semantics (and #16) first, announce, then flip.
5. **CHECK widening (#13):** additive, safe; do before adding webhook events.
6. **New webhook events (#7, #10):** additive, but the Stripe Dashboard endpoint must subscribe to the new event types; do NOT replay historical events while #5 is unfixed.
7. **Re-trial guard (#6) and Stripe Tax:** affect only new checkouts. `automatic_tax` requires Stripe Tax registration first or checkout errors — test in test mode.
8. **Never run blanket `UPDATE user_profiles SET tier=…` migrations** without `WHERE stripe_subscription_id IS NULL` (the `20260218000001` pattern would have clobbered payers).
