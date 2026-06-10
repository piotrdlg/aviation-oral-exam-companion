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

The target is `https://aviation-oral-exam-companion.vercel.app/api/health` — it returns **503 with per-check JSON** (`db`, `anthropic_key`, `deepgram_key`, `supabase_env`) when degraded, 200 when healthy.

**[OWNER] one-time setup (~5 min), UptimeRobot free tier (or Better Stack):**
1. Create monitor → type HTTP(s) → URL above → interval 5 min.
2. Alert contacts: email + (recommended) the free mobile app for push.
3. Optional keyword check: alert when response does NOT contain `"status":"ok"`.

## 3. Stripe (payment failures)

**[OWNER] dashboard settings:**
1. Settings → Notifications: enable email for **failed payments** and **disputes**.
2. Developers → Webhooks → the endpoint: enable **"Email me when this endpoint is failing"** (catches a broken webhook before tiers drift).
3. The app already emails `ALERT_EMAIL` (default pd@) on refunds/disputes (W3.1).

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
