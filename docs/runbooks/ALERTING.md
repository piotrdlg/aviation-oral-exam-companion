# Alerting Runbook (W6.1)

> Goal: a single operator gets PAGED when production breaks, instead of finding out from a user email. Steps marked **[OWNER]** can only be done by Piotr (account ownership).

## 1. Sentry (error tracking)

Code is already integrated (env-gated — zero effect until the DSN is set).

**[OWNER] one-time setup (~10 min):**
1. Create a free Sentry account → new project → platform **Next.js** → copy the DSN.
2. Vercel → Project → Settings → Environment Variables (Production):
   - `SENTRY_DSN` = the DSN
   - `NEXT_PUBLIC_SENTRY_DSN` = the same DSN
3. Redeploy. Verify: Sentry → Issues shows events after you trigger a test error (e.g. temporarily hit a route with bad input, or use Sentry's "verify installation" snippet).
4. Sentry → Alerts → create two rules, both → email `pd@imagineflying.com`:
   - "New issue created" (immediately on first occurrence)
   - "Error rate spike" (events > 10 in 5 minutes)
5. Optional: install the Sentry↔Vercel integration for release tagging + source maps.

What's captured: unhandled API/server exceptions (via Next.js `onRequestError`), client errors, plus **explicit captures** at the silent-data-loss sites (exam write chain: transcript/assessment/attempts/plan persistence) and both cron routes. Tagged with route + tier; no PII beyond user id; request bodies never sent.

## 2. Uptime (external watcher)

The target is `https://aviation-oral-exam-companion.vercel.app/api/health` — it returns **503 with per-check JSON** (`db`, `anthropic_key`, `deepgram_key`, `supabase_env`, `openai_embeddings`, `openai_tts`) when degraded, 200 when healthy.

`openai_embeddings` and `openai_tts` are **live probes**, not key-presence checks. Each makes a tiny real OpenAI call: one embedding, and a two-word gpt-4o-mini-tts clip. That proves FAA-source search and the backup voice actually work. Successes are cached for 10 minutes and failures for 60 seconds per server instance, with an 8 s timeout. A failed probe reports an allowlisted `error_class` (e.g. `openai_insufficient_quota`, `openai_auth`, `timeout`); non-timeout failures turn the endpoint 503, while timeouts are reported but do not turn the endpoint 503. **A lapse in OpenAI credit therefore pages you within one monitor interval** instead of failing silently. That happened from 2026-09-16 to 2026-09-29.

**[OWNER] one-time setup (~5 min), UptimeRobot free tier (or Better Stack):**
1. Create monitor → type HTTP(s) → URL above → interval 5 min.
2. Alert contacts: email + (recommended) the free mobile app for push.
3. Optional keyword check: alert when response does NOT contain `"status":"ok"`.

## 3. Stripe (payment failures)

**[OWNER] dashboard settings:**
1. Settings → Notifications: enable email for **failed payments** and **disputes**.
2. Developers → Webhooks → the endpoint: enable **"Email me when this endpoint is failing"** (catches a broken webhook before tiers drift).
3. The app already emails `ALERT_EMAIL` (default pd@) on refunds/disputes (W3.1).

## 3a. OpenAI (credits and billing)

FAA-source search (embeddings) and the backup voice run on the OpenAI API org. When its credit runs out, search fails, and grading is deferred (see below). The health probe above catches it, but a billing-side warning comes earlier.

**[OWNER] dashboard settings (platform.openai.com, org owner; menu labels may differ slightly):**
1. Settings → Billing: confirm **auto-recharge** is on, with a threshold and amount that cover at least a month of usage, and a valid card.
2. Settings → Limits (usage limits / budget): set a monthly **budget with an email notification threshold** (e.g. at 75%), so a runaway cost warns you before it blocks you.
3. Make sure the billing email is one you read: failed-recharge notices go there.

**What the app does during an outage (P0-H):** FAA-source failures are reported to Sentry with fingerprint `rag-grounding-missing` + error class (one issue per class, so it pages once, not per answer). Answers are **not graded without FAA sources**. The answer is saved as `ungraded` with `regrade_pending: true` and a regrade snapshot, and the student sees an "FAA references unavailable" notice. Planner progress is not advanced, and no element attempts are written.

## 4. Cron failure visibility

Vercel → Project → Settings → Cron Jobs shows per-run status. Both cron routes also capture failures to Sentry (rule 1 covers paging). Weekly: glance at the cron dashboard during the Stripe weekly review.

## 5. The weekly ritual (15 min)

| Check | Where |
|---|---|
| New Sentry issues | Sentry → Issues (triage: fix / mute / accept) |
| Scenario A/B health | `npm run audit:scenario-ab` |
| Stripe events | Dashboard → Payments + Disputes |
| Quota log-only events | PostHog → `*_logonly` events (flip hard-enforce flags when comfortable) |
| Uptime | UptimeRobot dashboard |
