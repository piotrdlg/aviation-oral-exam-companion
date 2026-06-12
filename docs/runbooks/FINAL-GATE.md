# Runbook — Final Launch Gate

The **final launch gate** is the standing pre-marketing-push ritual. Run it
before any deliberate traffic increase (ad spend, launch announcement, partner
push). It consolidates every earlier gate and adds the checks that would have
caught the critical findings from the 2026-06-09 comprehensive review.

- **Script:** `scripts/audit/public-launch-final-gate.ts`
- **Command:** `npm run audit:final-gate`
- **CI:** `.github/workflows/final-gate.yml` (manual `workflow_dispatch`)
- **Evidence:** `docs/reviews/2026-06-09-comprehensive-review/10-final-gate-result.md` (overwritten each run)

---

## How to run

### Locally (recommended — runs the full LIVE probe set)

```bash
# Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY (already present for normal dev).
npm run audit:final-gate

# Static only (no DB; what CI runs without secrets):
npm run audit:final-gate -- --no-live

# Deep: re-run the critical-finding guard tests (#12/#14/#15) in isolation:
npm run audit:final-gate -- --deep
```

### In CI

GitHub → Actions → **Final Launch Gate** → *Run workflow*. For the LIVE probes,
set these repo secrets first (Settings → Secrets → Actions):

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | live probes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon PII / RPC probes |
| `SUPABASE_SERVICE_ROLE_KEY` | quota-SUM + flag reads + ephemeral probe user |
| `GATE_TEST_EMAIL` / `GATE_TEST_PASSWORD` | *(optional)* a real non-admin account for the full cross-user RPC probe; without it the gate mints + deletes an ephemeral probe user |

Without the Supabase secrets the CI run is STATIC and the live blockers report
`SKIP` → verdict `GO-WITH-CONDITIONS`. Run locally before launch to get a true `GO`.

---

## The 19 checks

| # | Check | Sev | What it proves |
|---|-------|-----|----------------|
| 1 | support_auto_reply | BLOCKER | support ticket auto-reply wired |
| 2 | trial_ending_reminder | BLOCKER | trial-ending email exists |
| 3 | csp_header | BLOCKER | Content-Security-Policy configured |
| 4 | report_session_ownership | BLOCKER | report route checks ownership |
| 5 | tts_tier_gating | BLOCKER | `hasTtsAccess` present (D1 universal voice) |
| 6 | pricing_active_subscribers | BLOCKER | pricing handles active subs |
| 7 | typecheck | BLOCKER | `tsc --noEmit` clean |
| 8 | unit_tests | BLOCKER | full Vitest suite green |
| 9 | build_script | BLOCKER | build script present |
| 10 | rpc_cross_user_auth | BLOCKER | **R06 C1** — authenticated user cannot read another user's scores; anon revoked |
| 11 | anon_pii_blocked | BLOCKER | **R06 C2** — anon cannot read instructor certificate_number / admin_notes |
| 12 | idor_ownership_404 | BLOCKER | **R06 C3** — respond with another user's sessionId → 404 |
| 13 | quota_sum_reality | BLOCKER | **R05 #1** — `get_monthly_usage` SUMs chars, not row count |
| 14 | webhook_ordering_guard | BLOCKER | **R05 #5** — out-of-order Stripe events rejected by `event.created` |
| 15 | planner_advancement | BLOCKER | **R02 1–4** — live exam advances across tasks + completes naturally |
| 16 | flags_sane | WARN | graph off, scenario `off`/`ab`, kill switches off, maintenance off, quota flags present |
| 17 | ops_env_present | WARN | `SENTRY_DSN`, `CRON_SECRET`, `UPSTASH_*` set in Vercel production |
| 18 | pricing_parity | WARN | pricing page ↔ TIER_FEATURES ↔ enforcement agree (D1) |
| 19 | persona_voice_coherence | BLOCKER | every examiner in `voice.user_options` has a gender-consistent Aura-2 model + avatar; no user row stores a non-model `preferred_voice` (2026-06-12 finding) |

**#12 / #14 / #15** are critical-finding guards: the named test files run inside
the full suite (#8), so a green #8 proves them. `--deep` re-runs each in isolation.

---

## Reading the verdict

- **GO** — every blocker passed *and* every warning passed. Safe to push traffic.
- **GO-WITH-CONDITIONS** — every blocker that ran passed, but a warning failed or a
  live blocker was `SKIP`ped (static run). Resolve the warning or re-run locally
  with DB access before scaling spend.
- **NO-GO** — a blocker failed. Do not push traffic. The summary names the failures.

Exit code is non-zero only on a true blocker **FAIL** (so CI/static `SKIP`s don't
red-light the job, but the markdown verdict still records the condition).

---

## Notes on the live probes

- **#10** prefers `GATE_TEST_EMAIL`/`GATE_TEST_PASSWORD`. Absent those, it creates a
  confirmed `gate-probe+<ts>@heydpe-gate.example` user, signs in, probes one real
  user's scores (must be `forbidden`), then **deletes the probe user** (FK cascades
  clean it — W6.3). This is the only check that writes to prod, and it self-cleans.
- **#13** is `0 == 0` when there's no current-month TTS traffic; the SUM-vs-COUNT
  distinction is then carried by the static migration-body assertion.
- **#16/#17** are WARN by design — a stray flag or a missing `SENTRY_DSN` should be
  surfaced and fixed, but does not by itself block a launch decision.

Re-run this gate after any change to auth, quotas, webhooks, flags, or the exam
engine, and before every marketing push.
