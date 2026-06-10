# Review 06 — Security, Database Integrity & Operational Readiness

> Date: 2026-06-09 · Reviewer: AI agent (defensive security audit of owner's own app)
> Scope: RLS policies across 62+ migrations, API auth guards, middleware, rate limiting, secrets, ops posture

## Critical findings (exploitable or data-loss risk)

### C1. `SECURITY DEFINER` RPCs trust caller-supplied IDs instead of `auth.uid()` — cross-user data leak
- **Files**: `supabase/migrations/20260214000006_element_attempts.sql:70` (`get_element_scores(p_user_id, p_rating)`), `20260218200001_session_resume_and_scores.sql:13` (`get_session_element_scores(p_session_id)`) and `:67` (`get_element_scores`), `20260214000001_initial_schema.sql:430` (`get_uncovered_acs_tasks(p_session_id)`)
- **Severity**: Critical
- All three are `SECURITY DEFINER` (bypass RLS) and authorize on a **parameter**, never `auth.uid()`. No migration `REVOKE`s `EXECUTE` from `authenticated`/`anon`, so Supabase's default grant applies — reachable directly via PostgREST. Any authenticated user can call `supabase.rpc('get_element_scores', { p_user_id: '<other-user-uuid>' })` and receive another user's full per-element ACS exam performance. Session-scoped variants leak by `session_id`. User UUIDs are discoverable through instructor connection/referral flows. The app calls these correctly (`src/app/api/session/route.ts:270,301`) but that doesn't stop direct RPC calls.
- **Fix**: enforce ownership inside each function (`auth.uid()` check / join exam_sessions requiring `user_id = auth.uid()`), or `REVOKE EXECUTE FROM anon, authenticated` and go service-role-only with route-level auth.

### C2. Anonymous read policy on `instructor_profiles` exposes all columns (FAA certificate numbers, admin notes)
- **File**: `supabase/migrations/20260306000006_instructor_referrals.sql:21-24`
- **Severity**: High/Critical
- Policy `Public can read approved instructor profiles by slug` grants `SELECT TO anon, authenticated USING (status='approved' AND slug IS NOT NULL)` — RLS policies are **row** filters, not column filters. The migration comment claims the application layer excludes certificate_number, but the app SELECT is not the security boundary. With the public anon key, anyone can `GET /rest/v1/instructor_profiles?status=eq.approved&select=certificate_number,admin_notes,verification_data,rejection_reason`. (Depends on default table GRANT SELECT TO anon — not revoked in any migration.)
- **Fix**: dedicated safe-columns view granted to anon (revoke anon on the table), or serve public profiles only via the service-role route and drop the anon policy.

### C3. Exam write paths use service-role client keyed on client-supplied `sessionId` without ownership check (IDOR write)
- **File**: `src/app/api/exam/route.ts` (streaming branches: `:538`, `:696`, `:747-757`, `:1011-1016` write via `serviceSupabase`; `src/lib/session-enforcement.ts:43+` never validates session ownership)
- **Severity**: High
- The `summary` GET branch verifies ownership (`:195-205`), but streaming `start`/`respond`/`next-task` write transcripts, metadata, `status`, graded `result` through `serviceSupabase` keyed only on the supplied `sessionId`. An authenticated user who learns another user's session UUID can inject transcript rows and overwrite that session's state. Non-streaming branches use the RLS-scoped client and are safe — the inconsistency is the bug.
- **Fix**: one ownership check (`select id from exam_sessions where id=sessionId and user_id=user.id`) before any serviceSupabase write; 404 on miss.

## High/medium findings

### M1. Rate limiter is in-memory per-instance — ineffective on Vercel at scale
- `src/lib/rate-limit.ts:48` (module-level Map), `src/middleware.ts:52` — **Medium**
- Effective limits are `configured × instance_count`, reset on cold start. The 4/min STT-token and 5/min checkout limits (cost-control) are bypassable by spreading across instances. Fix: Upstash Redis / `@upstash/ratelimit` (or Vercel KV), at minimum on `/api/exam`, `/api/tts`, `/api/stt/token`, `/api/stripe/checkout`.

### M2. Global auth + rate-limit bypass via `PLAYWRIGHT_TEST` env var
- `src/middleware.ts:8-10` — **Medium (config-dependent)**
- `if (process.env.PLAYWRIGHT_TEST === '1') return NextResponse.next()` disables session refresh, route protection, and rate limiting. If ever set in Preview/Production, the app is fully open. Fix: additionally gate on non-production env; assert unset in prod.

### M3. CRON routes degrade to guessable token when `CRON_SECRET` unset
- `src/app/api/cron/daily-digest/route.ts:16-19` (same in nudges) — **Low/Medium**
- Unset secret → required header is literal `Bearer undefined` → attacker can trigger mass-email batches. Fix: fail closed when env var missing.

### Verified-good (no action)
- Per-route auth guards consistent: `/api/user/*`, `/api/exam`, `/api/session`, `/api/tts`, `/api/stt/token` all 401 on missing user; `/api/admin/*` via `requireAdmin()`; `/api/instructor/*` via `isInstructorApproved()`; instructor insights verify the connection row.
- Stripe webhook signature verified; Resend inbound verifies Svix.
- `user_profiles` has no user INSERT/UPDATE policy (no tier self-promotion); `usage_logs`/`latency_logs`/`subscription_events`/`user_entitlement_overrides` read-own or default-deny.
- No hardcoded keys; no service-role key in client code; no sensitive `NEXT_PUBLIC_` leakage. CSP set in `next.config.ts`.
- `hybrid_search`/`chunk_hybrid_search`/`get_related_concepts` touch only reference data — no per-user leak. `chunk_hybrid_search` pins `search_path = public`.

## DB integrity issues

- **D1. Missing `SET search_path` on SECURITY DEFINER functions** — `hybrid_search`, `get_related_concepts`, `get_uncovered_acs_tasks` (`20260214000001:367,427,458`), `get_element_scores` (`20260214000006:114`), `get_session_element_scores` (`20260218200001`). Only `chunk_hybrid_search` hardened. **Medium.** Fix with the C1 auth fix.
- **D2. No retention/purge on unbounded append-only tables** — `latency_logs`, `usage_logs`, `session_transcripts`, `element_attempts`, `email_logs`. pg_cron jobs (`20260219100002`) only flip status, never DELETE. **Medium (cost/perf over time).** Fix: pg_cron delete for telemetry > 90 days.
- **D3. `usage_logs.session_id` FK has no ON DELETE action** (`20260214000008_voice_tiers.sql:39`) — user-initiated session deletion FK-errors. **Low.** Fix: `ON DELETE SET NULL`.
- **D4. `usage_logs.user_id` → auth.users without CASCADE** — account deletion can be blocked. **Low.** Align with cascade/set-null.
- Indexes on hot paths present and adequate (`session_transcripts(session_id)`, `(session_id, exchange_number)`, `usage_logs(user_id, created_at)`, `element_attempts(session_id)`/`(element_code)`). No missing index found.
- `covered_task_ids` JSONB growth bounded by ACS task count — not a concern.

## Operational gaps

- **No CI/CD** — `.github/` absent. 743+ tests and typecheck never enforced pre-merge. **Minimal pipeline**: GitHub Actions running `npm run typecheck && npm test` on PRs + `scripts/audit/public-launch-gate.ts` as gate. Single highest-leverage operational fix.
- **Observability is static-analysis only** — synthetic "monitoring" (`scripts/smoke/phase21-synthetic.ts`) does file-content checks, not network probes. Open per docs 61/63: Sentry, TTS `maxDuration`, real load testing, the 16-check final gate. No external uptime/alerting on `/api/health`.
- **Backup/restore posture undocumented** — Supabase PITR is a paid add-on; enablement unverifiable from code. **Confirm in dashboard** (Database → Backups) before launch; document RTO/RPO + restore procedure.
- **CSP allows `'unsafe-inline' 'unsafe-eval'` in script-src** (`next.config.ts:21`) — driven by GTM/PostHog/Stripe; acceptable, nonce-based hardening post-launch. **Low.**

**Net: launch blockers are C1 (cross-user score leak, trivially exploitable by any logged-in user) and C2 (anonymous instructor-PII exposure). C3 and M1/M2 before paid traffic. Rest is hardening.**
