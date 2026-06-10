# HeyDPE Launch Readiness Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take HeyDPE from its current state (live, two paying users, "LAUNCH WITH CAUTION") to a commercially launchable web app in every aspect — security, exam-engine correctness, monetization enforcement, voice reliability, operations — plus a complete functional and technical specification for mirror iOS and Android apps ready for immediate development.

**Architecture:** Fix in dependency order: safety net first (CI, prod ground truth), then exploitable security holes, then the exam engine's client-authoritative state problem (the root cause of most grading/progress bugs), then monetization enforcement, then — in parallel — voice hardening and the graph→Scenario-Engine transition (drop the graph, build the proven non-linear exam generator per `2026-06-09-scenario-engine-design.md`), then operations and a real launch gate, then mobile. The exam engine refactor (W2.1) deliberately precedes the mobile spec because server-side state ownership is what makes a thin mobile client possible.

**Tech Stack:** Next.js 16 / TypeScript / Supabase (Postgres + RLS + RPC) / Claude Sonnet / Deepgram + tiered TTS / Stripe / Vercel. Mobile: React Native + Expo + RevenueCat (recommendation from review 07, confirmed by spike task M3).

**Evidence base:** All findings referenced as `R0x §n` live in `docs/reviews/2026-06-09-comprehensive-review/` (01=docs, 02=exam engine, 03=graph/RAG, 04=voice, 05=Stripe, 06=security, 07=mobile). Every task prompt below tells the agent to read the relevant review file first — the file:line evidence is there.

---

## How to use this plan

- **Execute tasks in order within a phase.** Phases 4 and 5 can run in parallel with each other after Phase 3. Phase 8 (mobile) tasks M1–M2 can start as soon as W2.1 lands.
- **One task = one coding-agent session = one PR.** Each task block contains the literal prompt to give the agent. Paste it verbatim; it is self-contained given repo access.
- **Agent assignment.** Two models are used, by task difficulty:
  - **Fable 5.0** — architectural refactors, ambiguous semantics, cross-cutting changes, evaluation design, specification writing. (Most capable current model.)
  - **Opus 4.8** — well-specified, single-subsystem implementation tasks where the review already pinned down the exact fix.
- **Production constraint that applies to EVERY task:** **THREE paying users** exist — owner-confirmed in the Stripe dashboard 2026-06-09: 3 real clients, **one of whom cancels effective July 2** (cancel-at-period-end). That canceling user is a live test case for W3.1's cancellation semantics: they MUST retain `dpe_live` access until July 2 and downgrade cleanly when `customer.subscription.deleted` fires — W3.1 verifies both. Plus one anomalous `dpe_live/none` tier grant to investigate in W3.x (doc 08 §4). No task may run a blanket `UPDATE user_profiles`, replay Stripe webhooks, or change live tier semantics without the explicit sequencing written into the task. When in doubt, the task must stop and report instead of proceeding.
- **Verification rule for data-gathering tasks (added after the W0.2 incident):** any task whose output is *facts about production* must (a) print and check the `error` object of every Supabase query — an empty result with a swallowed error is how W0.2 reported "0 paying users" when there were 3; (b) confirm column names against a sampled row before filtering/ordering on them (W0.2 queried a nonexistent `created_at` on `latency_logs` and concluded "stale since Feb" when the newest row was May 19); (c) re-derive every finding labeled CRITICAL via a second, differently-shaped query before reporting it.
- **Definition of done for every task** (in addition to per-task criteria): `npm run typecheck` passes, `npm test` passes (full suite), new behavior covered by tests, one commit per logical change, and the PR description links the review finding(s) it closes.

## Owner decision points — RESOLVED 2026-06-09 (except D2 final call and data-driven D4)

| # | Decision | Status | Resolution |
|---|----------|--------|------------|
| D1 | **Free-tier semantics** | **RESOLVED** | Every user — including the 3 free trial exams — gets the **full voice experience** (real end-product experience is the conversion driver). Voice is "secured from theft": all server-side quotas, anti-abuse gates, and rate limiting from W3.2/W1.4 are mandatory hard requirements, sized so a trial user costs ≈$1.30 (3 × 20-exchange sessions on Aura-2, see review 12). After the 3 trial exams: subscribe to continue (no permanent free voice). Pricing page copy updates to match (W3.3). |
| D2 | **Premium voice for dpe_live** | **RESOLVED** | **Stay on Deepgram Aura-2 for all tiers** (owner confirmed 2026-06-09 after the financial analysis in `12-voice-economics-d2.md`: blended voice COGS $5.72 vs $10.07–13.34/user/mo; EL whales cost 1.8–2.4× revenue). W4.2 executes the Aura-2 commit branch: delete Cartesia/PCM dead code, correct all "premium voice" claims, single-provider with OpenAI runtime fallback. Revisit only on the documented flip conditions (≥2pp proven conversion uplift or enterprise rate ≤$0.040/1K). |
| D3 | **Stripe Tax** | **RESOLVED** | Implement — was the intention from the beginning. W3.4 enables `automatic_tax` + `customer_update`; owner completes Stripe Tax registration in the dashboard first. |
| D4 | **Graph keep/simplify** | **RESOLVED** | **Drop the knowledge graph from the exam runtime** (owner decision 2026-06-09). Replacement: the **Scenario Engine** — a sophisticated non-linear exam generator (scenario-spine + server-governed LLM transitions + offline element-adjacency layer) that must **prove it works** through two predefined gates (offline judged eval ≥65% win-rate, then a production A/B with guardrails) before its flag turns on. Full design: `docs/plans/2026-06-09-scenario-engine-design.md`. Graph data + admin explorer remain as a read-only archive; runtime injection, dead RPCs, and the evidence-chain path are removed. Phase 5 below is restructured accordingly. |
| D5 | **Mobile framework** | **RESOLVED (delegated to AI analysis)** | **React Native + Expo + RevenueCat.** Rationale (review 07): the solo-maintainer TypeScript codebase reuses `exam-logic.ts`, `sentence-boundary.ts`, `types/database.ts`, and the entire API contract verbatim; Supabase and RevenueCat are first-class on RN; the one genuine risk (real-time PCM mic streaming) is de-risked by spike M3 with hard acceptance thresholds — Flutter is the contingency only if the spike fails on both devices. |

---

# PHASE 0 — Safety Net (before touching anything)

> **Status 2026-06-09 (Opus 4.8 run, assessed):**
> - **W0.1 ✅ functional, ⏳ not merged** — workflow live on PR #5, CI correctly fails on the pre-existing baseline (14 TS errors in `focus-section-wiring.test.ts`, 1 lint error in `e2e/helpers/storage.ts`, `process.exit` leaks in pipeline scripts). Merge blocked until W0.4 fixes the baseline.
> - **W0.2 ⚠️ done WITH CORRECTIONS** — the agent's two headline findings were wrong (reported 0 paying users → actually **3**; reported latency logs "stale since Feb" → newest row 2026-05-19, wrong column name queried). Doc 08 corrected in place same day; flags/cache/TTS/user-count claims re-verified and held. The verification rule above was added because of this.
> - **W0.3 ✅ done** — 4 secret backups moved to `~/secure-backups/heydpe/` (chmod 700), `.gitignore` verified, filename-level history scan clean. One rigor gap: "no rotation needed" rests on per-filename `git log` only → full-history content scan added to W0.4.
> - Confirmed by ground truth: `graph.enhanced_retrieval` AND `graph.shadow_mode` both ON in production (W5.1 turns both off); embedding cache reuse ~0.3% (broken as suspected); June TTS usage = 0 (simplifies the W3.2 quota cutover); PITR status still MANUAL CHECK (owner).
>
> **Status update 2026-06-10 (W0.4/W0.5 assessed):**
> - **W0.4 ✅ done with one bad ending, since repaired** — baseline fixes, gitleaks full-history scan (clean: 0 production secrets; 1 low-risk staging anon key), docs corpus committed, PR #5 merged. BUT the merge left **main's CI red**: lint has 141 pre-existing errors, and the agent misreported them as "in scripts/e2e" — actually **121 are in src/** (94 src/app, 27 src/lib). Repaired via PR #6 (2026-06-10): lint is now `continue-on-error` (advisory) while typecheck + the 1,243-test suite remain hard-blocking; **main is green**. Lint returns to blocking via W0.6.
> - **W0.5 ✅ done — NO BUG.** Zero exam sessions, transcripts, and TTS/STT calls since 2026-05-19 — the latency-log silence is zero traffic, not broken instrumentation. ⚠️ **Business signal for the owner:** the entire user base, including all 3 paying clients, has run zero exams in 3 weeks, and one client cancels July 2. Engagement/churn is now as urgent as the technical backlog.
> - **Stripe confirmed by owner (2026-06-10):** 3 real paying clients; 1 cancels effective July 2 — wired into the production constraint above as W3.1's live cancellation test case.

### Task W0.1: CI pipeline

**Agent:** Opus 4.8 · **Files:** Create `.github/workflows/ci.yml`

**Goal:** No code change in any subsequent task can merge without typecheck + full test suite passing. Single highest-leverage operational fix (R06 ops).

**Prompt:**
```
Repo: aviation-oral-exam-companion (Next.js 16, npm, Vitest). There is currently no .github directory — the 1,100+ unit tests and typecheck are never enforced before deploy (Vercel auto-deploys main).

Create .github/workflows/ci.yml that runs on pull_request and on push to main:
1. checkout, setup-node (read the engine/node version from package.json or .nvmrc; default Node 22), npm ci
2. npm run typecheck
3. npm test (vitest run, not watch)
4. npm run lint if a lint script exists in package.json (check first; skip if absent)
Do NOT add E2E/Playwright to CI (needs secrets and a live environment — out of scope).
Cache node_modules via actions/setup-node cache: 'npm'.
Then run the same three commands locally and report their current pass/fail state — if any fail at baseline, report the failures; do not fix unrelated test failures in this task, just document them in the PR description.
```

**Success criteria:** Workflow file merged; a test PR shows the checks running; baseline pass/fail state of `typecheck` and `test` documented in the PR.

---

### Task W0.2: Production ground-truth snapshot

**Agent:** Opus 4.8 · **Files:** Create `docs/reviews/2026-06-09-comprehensive-review/08-production-ground-truth.md`

**Goal:** Resolve every "cannot be known from the repo" item before remediation: live feature-flag values, real row counts, paying users' current state, PITR status. Several later tasks branch on these facts.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Supabase project ref pvuiwwqsumoqjepukjhz. You have read-only intent: this task makes ZERO changes to production data — SELECT queries only, via the Supabase MCP tools or scripts/audit/db-snapshot.ts patterns with the service-role key from .env.local.

Read docs/reviews/2026-06-09-comprehensive-review/01-docs-synthesis.md ("Contradictions") and 03-knowledge-graph-rag.md ("Measurement gaps") first.

Produce docs/reviews/2026-06-09-comprehensive-review/08-production-ground-truth.md answering:
1. system_config current values for: graph.enhanced_retrieval, graph.shadow_mode, rag.metadata_filter, tts_sentence_stream, all kill_switch.* keys, user_hard_caps, maintenance_mode.
2. Row counts: concepts, concept_relations (by relation_type), source_chunks, source_documents, acs_elements, exam_sessions (by status), session_transcripts, element_attempts, user_profiles, usage_logs, latency_logs.
3. The two paying users (user_profiles WHERE stripe_subscription_id IS NOT NULL): tier, subscription_status, last_webhook_event_ts, created_at. Anonymize emails to first3***@domain in the doc.
4. Current-month TTS usage per user: SELECT user_id, SUM(quantity), COUNT(*) FROM usage_logs WHERE event_type='tts_request' AND created_at >= date_trunc('month', now()) GROUP BY 1 — needed before the quota fix (review 05, migration safety note 2).
5. embedding_cache reuse: count of rows where last_used_at > created_at vs total.
6. latency_logs span percentiles: run the p50/p95 SQL from docs/system-audit/05 - Latency Audit and Instrumentation Plan.md:184-194 grouped by span name, last 30 days.
7. Whether Supabase PITR / backups are enabled (check via dashboard API if accessible; otherwise record "MANUAL CHECK REQUIRED" prominently).
8. Whether the .env backup files flagged in docs/PROJECT-RESTRUCTURE-PROPOSAL.md still exist in the repo root (ls the root for .env*), and whether any are tracked by git (git ls-files).
Format as a reference doc with a "Facts that change the plan" section at top flagging anything that contradicts the review assumptions.
```

**Success criteria:** Doc exists with all 8 sections answered or explicitly marked "manual check required"; zero writes to production; the "Facts that change the plan" section reviewed by Piotr before Phase 2 starts.

---

### Task W0.3: Secrets hygiene

**Agent:** Opus 4.8 · **Files:** repo root `.env*` backups, `.gitignore`

**Goal:** Remove the env-backup files containing real secrets from the working tree (flagged "High — Security Risk" in PROJECT-RESTRUCTURE-PROPOSAL.md) and rotate anything that was ever committed.

**Prompt:**
```
Repo: aviation-oral-exam-companion. docs/PROJECT-RESTRUCTURE-PROPOSAL.md flags ~6 .env backup files in the repo root containing real secrets. Task:
1. List all .env* files in the repo root. For each, determine via `git log --all --oneline -- <file>` whether it was EVER committed to git history.
2. For files never committed: move them to ~/secure-backups/heydpe/ (create dir, chmod 700) and confirm .gitignore covers .env* patterns (add if missing).
3. For files that WERE committed: do NOT rewrite git history yourself. Instead produce a report listing exactly which secrets (key names only, never values) appear in history and which providers they belong to (Supabase, Anthropic, OpenAI, Deepgram, Cartesia, Stripe, Resend, PostHog), so the owner can rotate them. Rotation itself is a manual owner action — list the rotation URL/console for each provider.
4. Verify `git status` shows no .env files staged and the working tree contains only .env.example + .env.local (untracked).
Report: files moved, files in history, rotation checklist.
```

**Success criteria:** No secret-bearing files in repo root; `.gitignore` covers them; rotation checklist delivered for anything in git history; nothing committed that contains a secret.

---

### Task W0.4: CI baseline green + merge + history secret scan (follow-up, added 2026-06-09)

**Agent:** Opus 4.8 · **Files:** `src/lib/__tests__/focus-section-wiring.test.ts`, pipeline scripts with `process.exit`, `e2e/helpers/storage.ts`, repo hygiene, PR #5

**Goal:** Make CI green on the existing baseline so PR #5 merges and the gate actually gates; close W0.3's rigor gap with a full-history content scan; land the plan/review corpus in git.

**Prompt:**
```
Repo: aviation-oral-exam-companion, branch feat/ci-enforcement (PR #5 — CI workflow exists and correctly fails on baseline). Fix the documented baseline failures WITHOUT changing any production behavior:
1. Typecheck: src/lib/__tests__/focus-section-wiring.test.ts has 14 errors — TestElement fixtures missing the created_at property required by AcsElement. Add created_at (any ISO string) to the fixtures; do not loosen types.
2. Test runner warnings: pipeline scripts call process.exit() at import time under Vitest (5 unhandled rejections). Find them (the vitest output in PR #5 names them) and guard the main() invocation with `if (!process.env.VITEST)` or `if (import.meta.url === pathToFileURL(process.argv[1]).href)` — pick the pattern already used elsewhere in scripts/ if one exists.
3. Lint: e2e/helpers/storage.ts has 5 no-explicit-any errors — type them properly (the Supabase session shape) rather than disabling the rule. Leave the 12 warnings (unused vars) alone unless trivial.
4. Repo hygiene on the same PR: delete the throwaway scripts scripts/_dev/ground-truth*.ts, scripts/_dev/check-latency-all.ts, scripts/_dev/verify-payers.ts, scripts/_dev/verify-claims.ts, scripts/_dev/verify-latency.ts (their findings are preserved in docs); add .playwright-mcp/, playwright-report/, test-results/, **/__pycache__/ to .gitignore if not covered; commit the untracked docs corpus (docs/plans/2026-06-09-*.md, docs/reviews/2026-06-09-comprehensive-review/, docs/PROJECT-*.md, docs/instructor-program/INSTRUCTOR-PROGRAM-MASTER.md, the modified CLAUDE.md, docs/system-audit additions) in a separate docs commit on this branch.
5. Secret history scan (closes W0.3's gap): run gitleaks over the FULL history (`brew install gitleaks` if absent; `gitleaks git --redact -v .`). The W0.3 conclusion "no rotation needed" rests on per-filename git log only — this scan checks content everywhere. Append the result to docs/reviews/2026-06-09-comprehensive-review/09-secrets-hygiene-audit.md (redacted finding list or a clean bill). If real secrets surface in history: STOP, report, owner rotates before anything else.
6. Push; confirm CI goes green on PR #5; merge PR #5 (squash) once green.
```

**Success criteria:** PR #5 merged with CI green (typecheck + tests + lint all passing); gitleaks full-history result appended to doc 09; docs corpus committed; temp scripts gone.

---

### Task W0.5: Latency telemetry gap diagnosis (follow-up, added 2026-06-09)

**Agent:** Opus 4.8 · **Files:** read-only investigation + (if bug confirmed) minimal fix in `src/lib/timing.ts` call sites

**Goal:** Determine whether the 3-week `latency_logs` silence (newest row 2026-05-19, corrected doc 08 §6) is low traffic or broken instrumentation — Phase 5/6 measurement depends on these logs working.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Corrected ground truth (docs/reviews/2026-06-09-comprehensive-review/08-production-ground-truth.md §"Facts" item 4): latency_logs newest row is 2026-05-19 (column is `timestamp`, not created_at); no rows in the ~3 weeks since.
1. Read-only correlation query: count exam_sessions and session_transcripts created after 2026-05-19, and voice usage_logs (event_type tts_request/stt) in the same window. If there was meaningful voice-exam activity but zero latency rows → instrumentation bug. If activity was ~zero → no bug; document and close.
2. If bug: trace the write path (src/lib/timing.ts → wherever latency_logs is inserted, likely the exam route / voice telemetry) and git log -S the insert call around mid-May to find what change cut it. Propose+apply the minimal fix; verify a dev exam writes a row.
3. Either way, append the verdict with evidence to doc 08 §6.
Print and check the error object of every query (verification rule in the master plan header).
```

**Success criteria:** Verdict documented with query evidence; if it was a bug, a dev exam demonstrably writes a latency row again; zero production writes during investigation.

---

### Task W0.6: Lint debt burn-down → re-enable blocking lint (added 2026-06-10)

**Agent:** Opus 4.8 · **Files:** ~141 lint errors across `src/app` (94), `src/lib` (27), `scripts` (13), `src/types` (3), `src/hooks` (2), `src/components` (1), `e2e` (1); `.github/workflows/ci.yml`

**Goal:** Pay off the lint debt that forced lint to advisory in PR #6, then make lint blocking again. Type-level changes only — zero behavior change.

**Prompt:**
```
Repo: aviation-oral-exam-companion. CI (.github/workflows/ci.yml) currently runs npm run lint with continue-on-error: true because the codebase has ~141 pre-existing eslint errors (mostly @typescript-eslint/no-explicit-any). Fix them ALL with type-level changes only:
1. Run npm run lint and group errors by file. Work file-by-file, largest first (src/app/(dashboard)/settings/page.tsx and practice/page.tsx likely dominate).
2. Replace `any` with proper types: prefer existing types from src/types/database.ts and module-local interfaces; use `unknown` + narrowing where the shape is genuinely dynamic (e.g., JSON metadata); use precise event/DOM types in components. NEVER use eslint-disable comments and NEVER loosen tsconfig/eslint config — the point is real types.
3. ZERO behavior change: no logic edits, no renames beyond types. After every few files: npm run typecheck && npm test must stay green (1,243 tests).
4. Also clear the ~12 unused-var warnings where trivial (prefix with _ or remove).
5. When npm run lint exits 0: remove `continue-on-error: true` (and its comment) from .github/workflows/ci.yml so lint blocks again.
6. One PR; in the description list error counts before/after per directory. CI must be fully green (typecheck + test + lint all blocking) before merge.
CAUTION: practice/page.tsx and settings/page.tsx will be heavily refactored in Phase 2 — if any fix there risks semantic drift, prefer the most conservative typing (unknown + narrow) over clever restructuring.
```

**Success criteria:** `npm run lint` exits 0; `continue-on-error` removed; CI green on the PR with lint blocking; zero test/typecheck regressions; no eslint-disable added.

---

# PHASE 1 — Security Criticals (exploitable today)

> **Status 2026-06-10: ✅ PHASE COMPLETE — deployed to production and verified live.**
> Executed by agent (Haiku 4.5, mislabeled as Opus 4.8), then **reviewed, repaired, and deployed hands-on by Fable 5** (PR #7). Three serious flaws found and fixed before deploy:
> 1. **W1.1's auth guard would have allowed ANONYMOUS callers** (`auth.uid() IS NULL` escape — anon requests also have NULL uid; the "fix" would have made C1 worse). Replaced with `auth.role()='service_role'` escape + ownership check + `REVOKE FROM anon`.
> 2. **W1.1's migration was dead on arrival** — it rewrote `hybrid_search`/`get_related_concepts` with invented bodies, one syntactically invalid (whole migration would have aborted). Replaced with `ALTER FUNCTION … SET search_path`; user-data RPC bodies verified verbatim against source migrations.
> 3. **W1.4 broke the build** (deps in package.json, never installed) and hand-rolled a 5-round-trip racy Redis check while importing-but-ignoring `@upstash/ratelimit` — now one atomic `slidingWindow` call. **W1.3's test was theater** (asserted mocks nothing invoked) — replaced with a real route-level test.
> Also: the agent committed everything directly to local main, unpushed, untested, undeployed — none of it had reached production until PR #7.
>
> **Production verification (2026-06-10, live probes):** all three RPCs DENY anon (`forbidden` exceptions); service-role legit path returns data (921 rows); `instructor_profiles` sensitive columns return 0 rows to anon; `public_instructor_profiles` view exposes only safe columns. Migrations `20260610000001/2` applied (plus drift `20260310000002`, a no-op). Vercel deploy of W1.3/W1.4 code: success. 1,252 tests green.
>
> **Owner actions outstanding:** (1) verify `CRON_SECRET` is set in Vercel env — cron auth now FAILS CLOSED, so a missing secret means digest/nudge crons 401 until set; (2) create the free Upstash Redis DB and set `UPSTASH_REDIS_REST_URL/TOKEN` in Vercel — until then rate limiting remains in-memory (warn-fallback, same as before).

### Task W1.1: Lock down SECURITY DEFINER RPCs

**Agent:** Opus 4.8 · **Files:** New migration `supabase/migrations/2026xxxx_secure_rpc_auth.sql`; tests

**Goal:** Close R06 C1 — any authenticated user can currently read any other user's full exam performance via direct RPC calls.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/06-security-db-infra.md finding C1 and D1 first.

Three SECURITY DEFINER RPCs authorize on caller-supplied parameters instead of auth.uid() and are executable by any authenticated user via PostgREST:
- get_element_scores(p_user_id, p_rating) — supabase/migrations/20260214000006_element_attempts.sql:70 and the later version in 20260218200001_session_resume_and_scores.sql:67
- get_session_element_scores(p_session_id) — 20260218200001:13
- get_uncovered_acs_tasks(p_session_id) — 20260214000001_initial_schema.sql:430

Write ONE new migration (CREATE OR REPLACE FUNCTION for each) that:
1. get_element_scores: raise exception (or return empty) unless p_user_id = auth.uid() OR auth.uid() IS NULL is false... specifically: `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;` — BUT first grep src/ and scripts/ for every caller: the app calls it with user.id (src/app/api/session/route.ts:270,301) which is fine, and instructor-insights may call it server-side with the service role for connected students — service_role has auth.uid() NULL, so allow when auth.uid() IS NULL (service role bypasses anyway only if the function is invoked with the service key; verify by checking how src/lib/instructor-insights.ts fetches scores and adjust: if it uses the service client, the check `p_user_id = auth.uid() OR auth.role() = 'service_role'` is the right shape).
2. get_session_element_scores and get_uncovered_acs_tasks: join exam_sessions and require user_id = auth.uid() (same service_role escape).
3. Add `SET search_path = public` to ALL SECURITY DEFINER functions missing it: the three above plus hybrid_search and get_related_concepts (20260214000001:367,427).
4. Add SQL tests or a verification script under scripts/audit/ that connects with an authenticated (non-service) JWT for user A and asserts the RPC with user B's id/session id returns an error or zero rows.
Apply the migration to production via supabase MCP/CLI after local verification. This migration is read-pattern-only — it cannot affect the two paying users' data.
```

**Success criteria:** Cross-user RPC call with a real authenticated JWT returns forbidden/empty; the app's own progress page, quick drill, and instructor insights still work (manually verified against prod or staging); all SECURITY DEFINER functions have pinned `search_path`.

---

### Task W1.2: Stop anonymous exposure of instructor PII

**Agent:** Opus 4.8 · **Files:** New migration; possibly `src/app/instructor/[slug]/page.tsx` data access

**Goal:** Close R06 C2 — FAA certificate numbers, admin notes, verification data of approved instructors are readable by anyone with the public anon key.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/06-security-db-infra.md finding C2.

The policy "Public can read approved instructor profiles by slug" (supabase/migrations/20260306000006_instructor_referrals.sql:21-24) grants anon SELECT on instructor_profiles — all columns, including certificate_number, admin_notes, verification_data, rejection_reason.

Fix:
1. Find every consumer of the anon read path: grep src/ for instructor_profiles reads from client components or the public instructor page (src/app/instructor/[slug]/page.tsx) and /api/referral/lookup.
2. Create a migration that: (a) DROPs the anon/authenticated public-read policy on instructor_profiles; (b) creates a view public_instructor_profiles exposing ONLY safe columns (display name, slug, bio/photo fields, status-derived visibility — inspect the table definition in migrations 20260305000002 to choose; explicitly exclude certificate_number, admin_notes, verification_data, rejection_reason, email, quotas) with security_invoker=false and a WHERE status='approved' AND slug IS NOT NULL filter baked in; (c) GRANT SELECT on the view to anon, authenticated.
3. Update any client/page code that read the table directly to read the view (or better, route through the existing service-role API route).
4. Keep instructors' own-profile read policy and admin access intact.
5. Verify with curl using the anon key: SELECT certificate_number from the table → must fail/return nothing; SELECT from the view → returns only safe columns.
Apply to production after local verification.
```

**Success criteria:** curl with anon key can no longer read any sensitive column; public instructor page (`/instructor/[slug]`) and referral lookup still render correctly; instructors still see their own full profile.

---

### Task W1.3: Exam route IDOR ownership check

**Agent:** Opus 4.8 · **Files:** `src/app/api/exam/route.ts`, `src/lib/session-enforcement.ts`, tests

**Goal:** Close R06 C3 — streaming exam actions write to any `sessionId` via the service-role client without verifying ownership.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/06-security-db-infra.md finding C3.

src/app/api/exam/route.ts streaming branches (start/respond/next-task; service-role writes at :538, :696, :747-757, :1011-1016) accept sessionId from the request body and never verify the session belongs to the authenticated user. The GET summary branch DOES verify (:195-205) — replicate that pattern.

Fix:
1. Immediately after auth (user resolved) and sessionId extraction in the POST handler, when sessionId is present: `select id from exam_sessions where id = :sessionId and user_id = :user.id` via the RLS-scoped client; return 404 JSON on miss. One check, before any branch logic.
2. In src/lib/session-enforcement.ts, enforceOneActiveExam: it upserts active_sessions with caller userId + arbitrary examSessionId — after fix 1 the sessionId is owned, but add a defensive comment and ensure the function is only ever called post-ownership-check.
3. Add a Vitest test for the route handler (mock Supabase) asserting: user A + user B's sessionId → 404 and zero service-role writes.
4. Do not change any other behavior in this task — the exam engine refactor (separate task) depends on this landing first and clean.
```

**Success criteria:** Request with another user's sessionId returns 404 before any write; existing exam flows unaffected (start/respond/resume tested manually); test added and green.

---

### Task W1.4: Middleware and cron hardening + distributed rate limiting

**Agent:** Opus 4.8 · **Files:** `src/middleware.ts`, `src/app/api/cron/*/route.ts`, `src/lib/rate-limit.ts`, package.json

**Goal:** Close R06 M1/M2/M3: the `PLAYWRIGHT_TEST` global bypass, fail-open cron auth, and the in-memory rate limiter that doesn't actually limit on serverless.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/06-security-db-infra.md findings M1, M2, M3.

Three fixes in one PR:
1. src/middleware.ts:8-10 — the PLAYWRIGHT_TEST==='1' bypass disables ALL auth and rate limiting. Gate it additionally on environment: only honor it when process.env.NEXT_PUBLIC_APP_ENV !== 'production' AND process.env.VERCEL_ENV !== 'production'. Keep e2e tests working locally.
2. /api/cron/daily-digest and /api/cron/nudges (src/app/api/cron/*/route.ts:16-19): fail closed — `if (!process.env.CRON_SECRET || authHeader !== ...) return 401`.
3. src/lib/rate-limit.ts is an in-memory per-Lambda Map — ineffective on Vercel. Replace the backing store with Upstash Redis via @upstash/ratelimit + @upstash/redis (sliding window), keeping the existing per-route config shape and the middleware integration (src/middleware.ts:52). Requirements: (a) read UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from env; (b) if env vars are absent, FALL BACK to the current in-memory limiter with a console.warn — local dev and tests must not require Redis; (c) apply distributed limiting at minimum to /api/exam, /api/tts, /api/stt/token, /api/stripe/checkout; (d) keep the per-user (cookie/bearer-derived) identifier logic, IP fallback unchanged.
4. Update .env.example with the two new vars + a comment. Add unit tests for the fallback behavior.
Note in the PR: the owner must create a free Upstash database and set the two env vars in Vercel before this provides protection; until then behavior is unchanged (warn-fallback).
```

**Success criteria:** Bypass inert in production env combos; cron 401s without secret; rate limiter uses Redis when configured and degrades gracefully without it; tests green.

---

# PHASE 2 — Exam Engine Correctness (the heart of the product)

> **Status 2026-06-10: ✅ PHASE COMPLETE — executed hands-on by Fable 5, deployed to production.**
> PRs #8–#13 (W2.1–W2.6), each CI-green and squash-merged; migration `20260610000003` applied to production (anon-guard verified intact post-replace). All 20 confirmed bugs + 5 architecture risks from review 02 closed:
> - **W2.1** server-owned exam state in `exam_sessions.metadata`; live planner advancement (`shouldAdvanceElement` rides the assessment SSE event → client triggers server-validated next-task); resume-current fixed; enforce-one-active-exam verify-before-write; all metadata writes read-merge-write.
> - **W2.2** `ungraded` state for infrastructure failures (never fake 'partial'); element-code validation vs the task's real codes; separated attempt/mention writes; examiner transcript persists independently of assessment; prompt-cache + content[0] guards.
> - **W2.3** V2 canonical (V1 grade derived via `v2ToV1Grade`); ordered deterministic dedupe; plan-filtered ≤100% math (200-trial property test); mention credit only on satisfactory; grading waits for the final exchange's background writes; shared `PARTIAL_CREDIT`.
> - **W2.4** coverage merges (never shrinks) server-side + client seeds from store on resume; exchange numbers = server-side MAX+1 on every path.
> - **W2.5** lifetime treemap selectable ('lifetime' sentinel); server-side `action=stats` aggregates; abandoned/expired excluded from lifetime scores (migration, W1.1 guard preserved); oral-area exclusion enforced in queue + plan sizing.
> - **W2.6** regression harness: in-memory DB fake drives the REAL routes + REAL planner through a full exam (advancement, completion, write integrity, resume, follow-up policy) in CI; `examiner_assessment_mismatch` telemetry added.
> Tests: 1,243 → 1,275. Incident note: GitHub push protection blocked one push (leftover local dev script with a hardcoded DB credential) — file deleted, `scripts/_dev/` gitignored, secret never reached the remote.

> Read order for every agent in this phase: `docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md` in full.

### Task W2.1: Server-side exam state ownership (the root-cause refactor)

**Agent:** Fable 5.0 · **Files:** `src/app/api/exam/route.ts`, `src/lib/exam-planner.ts`, `src/lib/session-enforcement.ts`, `src/app/(dashboard)/practice/page.tsx`, tests

**Goal:** Fix the architecture flaw behind R02 bugs 1, 2, 3, 4, A, B, 13(arch): the server trusts client-supplied planner state, exam plan, and history. Make `exam_sessions.metadata` the single authoritative store of `plannerState` + `examPlan`, advanced server-side on every respond. This unblocks: planner advancement in live exams, natural exam completion, graph retrieval per element, element-aware grading — and makes the future mobile client thin.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md FULLY before coding — especially Confirmed bugs 1-4, Suspicious A/B, and Architecture risks 1/5. This is the most important task in the remediation plan. Work test-first where the pure logic allows it.

Current broken design: the client (practice/page.tsx) is a state shuttle that posts taskData/history back on every call but NEVER sends plannerState/examPlan (bug 2), and never calls next-task during a live exam (bug 1) — so the planner, transitions, depth contracts, bonus questions, mention credit, graph retrieval, and natural completion are all dead in production. Every exam stays pinned to its first task.

Target design — server-owned state:
1. On `start`: route already persists metadata.{plannerState, examPlan} (route.ts:429-450). Keep that, and treat it as authoritative from then on.
2. On `respond`: load plannerState + examPlan from exam_sessions.metadata server-side (sessionId is now mandatory for respond — return 400 without it; ownership check from the W1.3 task is already in place). Ignore any client-supplied plannerState/examPlan (accept-and-ignore for backward compat during rollout). Use the loaded state for: graph elementCode (route.ts:617), assetContext (route.ts:667), depth/grading contract element type (route.ts:644-649), creditMentionedElements/useBonusQuestion (route.ts:738, 871-897).
3. Planner advancement during the live loop: after each assessed answer, decide server-side whether to stay on the current element (follow-up) or advance. Implement: advance when assessment.score === 'satisfactory', OR when the element has received >= 2 attempts this session, else stay. When advancing, run the existing advancePlanner/pickNextElement logic inline in respond (do NOT require the client to call next-task) and include the new taskData + transition hint in the SSE response the same way next-task does today (X-Task-Data headers / payload fields — inspect how the client consumes next-task responses at practice/page.tsx:1425-1459 and keep the wire shape compatible).
4. isExamComplete: with the plan now loaded from metadata each turn and asked_count persisting (bug 3), the natural completion path (route.ts:966-1030) becomes reachable. Verify it triggers when the plan budget is exhausted; emit sessionComplete:true to the client.
5. Metadata writes: ALL metadata updates in the respond/next-task paths must read-merge-write (spread existing metadata) — fix the clobber paths at route.ts:747-757, 884-894, 1099-1108 (Suspicious A). Move all metadata writing to the server; remove the client's fire-and-forget /api/session metadata updates that race it (practice/page.tsx:1070-1087 — keep only exchange_count/status updates if still needed, or fold those server-side too) (Suspicious B).
6. Fix enforceOneActiveExam (bug 4): for respond/next-task, READ the active_sessions row and verify before upserting, so a superseded device actually gets rejected:true and the 409 session_superseded path works. Add a unit test simulating two devices.
7. Client (practice/page.tsx): stop tracking plannerState/examPlan client-side; consume the per-respond advancement payload (new task data / transition) the same way the resume path consumes next-task today. Keep history client-side for display + LLM context (server still receives history for the prompt — validating/rebuilding history server-side from transcripts is a non-goal for this task).
8. Resume path: resume-current must load metadata state and use the CURRENT pending element = plannerState.recent[recent.length-1], not queue[cursor] (bug 5 — fix it here since you're touching the path; see review for exact lines).

Migration/compat: existing in-flight sessions have metadata in the current shape — the loader must tolerate missing/legacy fields by rebuilding a fallback plan ONCE and persisting it (never resetting asked_count on subsequent loads — that is bug 3).

Tests: extend src/lib/__tests__/ with planner-advancement unit tests (satisfactory→advance, unsatisfactory→stay, 2-attempt cap, completion firing at budget). Add a route-level test with mocked Supabase asserting respond loads state from metadata and ignores client-supplied plan. Run the full suite.

Out of scope (separate tasks): assessment write robustness, grading math, progress page. Do not touch exam-result.ts.
```

**Success criteria:** A full simulated exam (scripted via the API or e2e) visits multiple ACS tasks, produces `element_attempts` across multiple tasks, and terminates naturally with `sessionComplete:true` when the plan budget is exhausted; metadata keys written at start (persona, promptTrace) survive a full exam; two-device test gets a 409; full test suite green; typecheck green.

---

### Task W2.2: Robust assessment persistence

**Agent:** Opus 4.8 · **Files:** `src/lib/exam-engine.ts`, `src/app/api/exam/route.ts`, practice page badge rendering, tests

**Goal:** Fix R02 bugs 6, 7, 8, C, E: one hallucinated element code no longer destroys an exchange's progress; infrastructure failures no longer award 70% credit; examiner transcripts persist even when assessment fails.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md bugs 6, 7, 8 and Suspicious C, E. Depends on W2.1 being merged (route shape changed).

Five fixes:
1. Validate assessAnswer output (src/lib/exam-engine.ts:811-840): score must be one of 'satisfactory'|'partial'|'unsatisfactory' — anything else (or JSON parse failure) becomes score:'ungraded' (new value), never a fake 'partial'. Validate primary_element and mentioned_elements against the element codes that were listed in the assessment prompt (the task's elements are in memory at exam-engine.ts:699-703); drop invalid codes, dedupe mentions, log a posthog/console warning with the dropped values.
2. Retry: on JSON parse failure or empty content, retry assessAnswer once before falling back to 'ungraded'.
3. writeElementAttempts (route.ts:144-153): insert the primary attempt in its own statement; insert mentions in a second statement; a mention failure must not lose the primary. Skip the insert entirely when score === 'ungraded' (ungraded answers must not appear in element_attempts).
4. Decouple the after() writes (route.ts:689-761): persist the examiner transcript from fullTextPromise in its own try/catch BEFORE awaiting the assessment; assessment update, attempts, citations each get their own try/catch so one failure cannot abort the rest (bug 8).
5. Guard response.content[0] indexing at exam-engine.ts:350-351 and 811-812 with content.find(b => b.type === 'text'). Fix loadPromptFromDB (exam-engine.ts:90-100) to not cache empty candidate lists when the query errored.
UI: where the score badge renders (practice/page.tsx:1977-1990), 'ungraded' shows as a neutral "Not assessed" badge, excluded from points (grading exclusion is W2.3's job — here just ensure the value flows through types).
Update src/types/database.ts if the assessment type needs the new score value. Tests: unit tests for validation (bad score string, hallucinated element code, duplicate mentions), the retry, and the decoupled writes (mock failure of assessment must still persist examiner transcript).
```

**Success criteria:** Tests prove: invalid LLM output never throws and never writes garbage; a failed assessment still persists the examiner transcript; ungraded never reaches element_attempts; suite green.

---

### Task W2.3: Grading unification — V2 canonical, consistent math

**Agent:** Fable 5.0 · **Files:** `src/lib/exam-result.ts`, `src/lib/exam-logic.ts`, `src/app/api/exam/route.ts`, `src/app/api/session/route.ts`, practice + progress pages, tests

**Goal:** Fix R02 bugs 9, 11, 12, 13, 19, 20 and Architecture risk 4: one grading system with deterministic, defensible math; no INCOMPLETE-for-completed-exams; no >100% scores; mention credit only on satisfactory answers.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md bugs 9, 11, 12, 13, 19, 20 and Architecture risk 4. Depends on W2.1 and W2.2.

Make ExamResultV2 the canonical grade:
1. Deterministic dedupe (bug 11): add .order('created_at', { ascending: true }) to both element_attempts fetches (route.ts:970-976; session/route.ts:134-139).
2. V2 math (bug 12): in computeExamResultV2 (exam-result.ts:189-221), filter attempts to element codes present in examPlan.coverage before scoring; exclude credited elements that also have a scored attempt (no double count); after the fix, remove or assert-against the Math.max(0,...) clamp masking negative not-asked counts. Score must be provably <= 100%: add a property-style test generating random attempt sets.
3. Mention credit (bug 13): in the route, only call creditMentionedElements when assessment.score === 'satisfactory'. Exclude 'ungraded' from all point math.
4. Completion grade (bug 9): for completion_trigger 'all_tasks_covered', grade against examPlan.planned_question_count (or count of asked elements), not raw queue length; a naturally completed exam must never grade 'incomplete'.
5. V1→V2 canonicalization (arch risk 4): derive the exam_sessions.result column value FROM the V2 outcome (map V2 pass/conditional/fail/incomplete to the V1 enum) at grading time, so the progress badge (progress/page.tsx:466-468) and results modal (practice/page.tsx:2424-2465) agree. Keep computeExamResult (V1) only as a fallback when no examPlan exists in metadata (legacy sessions).
6. Grading race (bug 19): the grade call must not read element_attempts before the final exchange's after() writes land. Implement: gradeSession (session/route.ts grade action) retries up to 3× at 1.5s intervals while the latest student transcript row for the session has no assessment yet; document the chosen approach in code.
7. Shared constant (bug 20): export PARTIAL_CREDIT = 0.7 from exam-logic.ts; use it in exam-result.ts and progress/page.tsx:208 (replace the 0.5).
Tests: unit tests for each numbered fix; a golden-path test: scripted attempt set → exact expected V2 score, stable across runs.
```

**Success criteria:** Same attempt data always produces the same grade; no input can exceed 100%; completed exam grades as pass/fail (not incomplete); badge and modal show the same outcome; suite green.

---

### Task W2.4: Resume integrity

**Agent:** Opus 4.8 · **Files:** `src/app/(dashboard)/practice/page.tsx`, `src/app/api/session/route.ts`, `src/app/api/exam/route.ts`, tests

**Goal:** Fix R02 bugs 10 and 14: resuming a session no longer wipes accumulated coverage; transcript ordering is consistent.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md bugs 10 and 14. Depends on W2.1 (bug 5's element fix landed there; metadata is now server-owned).

1. Bug 10 — coverage wipe on resume: resumeSession (practice/page.tsx:1398) resets taskScoresRef and never rehydrates from session.acs_tasks_covered; the next update then full-replaces the server array (session/route.ts:123). Fix BOTH ends: (a) seed taskScoresRef from the fetched session.acs_tasks_covered on resume; (b) server-side, merge: acs_tasks_covered = union(existing, incoming) instead of replace — never shrink the set from a client update.
2. Bug 14 — exchange numbering: respond derives exchange_number from client history length (route.ts:597) while next-task uses transcript row count (route.ts:1083-1087, 1140-1144). Unify: server-side `SELECT COALESCE(MAX(exchange_number),0)+1 FROM session_transcripts WHERE session_id=...` for the student row of each new exchange; the paired examiner row gets the same number. Verify resumed-history loading (route.ts:947-952; session/route.ts:368) now orders question-before-answer; adjust the examinerAskedLast heuristic (practice/page.tsx:1425-1426) if needed.
Tests: resume flow test asserting coverage survives (create session with 3 covered tasks → resume → answer once → coverage contains 4, not 1); exchange numbering test across respond→advance→respond.
```

**Success criteria:** Resume → answer no longer shrinks `acs_tasks_covered` (verified against a seeded session); transcripts sort correctly after mixed respond/advance sequences; suite green.

---

### Task W2.5: Progress page truth

**Agent:** Opus 4.8 · **Files:** `src/app/(dashboard)/progress/page.tsx`, `src/app/api/session/route.ts`, new migration for RPC filters, `src/lib/exam-logic.ts`, tests

**Goal:** Fix R02 bugs 15, 16, 17, 18: lifetime view selectable; stats not capped at 20 sessions; abandoned exams excluded from progress; flight-only areas excluded from the planner.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md bugs 15-18.

1. Bug 15: the auto-select effect (progress/page.tsx:147-151) re-selects the latest session whenever selectedSessionId===null, making "All Exams (Lifetime)" (set to null at :426-430) snap back. Use a sentinel value 'lifetime' for the option and only auto-select on first load (initialized flag).
2. Bug 16: lifetime stats are computed from the default /api/session list, limit(20), all ratings (session/route.ts:384). Add a server-side aggregate: either a new action=stats on /api/session returning {totalSessions, totalExchanges, uniqueTasksCovered} per rating via SQL aggregation (count/sum over exam_sessions, jsonb array length union for tasks), or an RPC. Use it for the stat tiles and achievements (progress/page.tsx:193-197, 234-237). Keep the 20-row list for the session dropdown only.
3. Bug 17: new migration CREATE OR REPLACE for get_element_scores and get_session_element_scores adding AND es.status NOT IN ('abandoned','expired') to the element_attempts↔exam_sessions joins (see migrations/20260218200001:50-52,106-109). NOTE: this migration touches the same functions as security task W1.1 — write it as a follow-up CREATE OR REPLACE that PRESERVES the auth.uid() checks added there (read the W1.1 migration first; coordinate, don't clobber).
4. Bug 18: in buildElementQueue (exam-logic.ts:399-400) apply the ORAL_EXAM_AREA_PREFIXES filter (exam-logic.ts:25-56) so flight-only areas (PA.IV/V/X etc.) are excluded from planner exams, matching the documented 9-of-12-areas design; apply the same filter in countTotalOralElements (exam-planner.ts:77-85). Update affected unit tests and add one asserting PA.IV elements never enter a queue.
```

**Success criteria:** Lifetime view reachable and stable; stat tiles match direct SQL counts for a seeded user with 25+ sessions; abandoned-session attempts vanish from treemap/weak-areas; no flight-only-area questions in 20 simulated planner exams; suite green.

---

### Task W2.6: Exam-flow regression harness

**Agent:** Fable 5.0 · **Files:** Create `scripts/eval/exam-flow-regression.ts`, npm script, optional e2e

**Goal:** A scripted end-to-end exam (real API, mocked or cheap-model LLM) that locks in Phase 2's wins and runs in CI as the engine's safety net. Also produces the examiner-vs-assessment consistency telemetry (R02 arch risk 2).

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/02-exam-engine-grading.md "Architecture risks". Depends on W2.1–W2.5 merged.

Build scripts/eval/exam-flow-regression.ts (npm script "eval:exam-flow") that runs a full simulated exam against a local dev server (or route handlers invoked directly with mocked auth — choose the approach that runs in CI without secrets; mock the Anthropic client with deterministic canned assessments/questions keyed by element):
Assertions, hard-fail on violation:
1. Planner advancement: >= 3 distinct ACS tasks visited in a 12-exchange exam with all-satisfactory canned answers.
2. Natural completion: with a small plan budget, sessionComplete fires and the session row reaches status completed with a non-'incomplete' result.
3. Write integrity: every student transcript row has an assessment; element_attempts has exactly one primary attempt per assessed exchange; no orphan examiner rows.
4. Coverage merge: simulated resume mid-exam does not shrink acs_tasks_covered.
5. Grade determinism: computing the grade twice yields identical V2 output.
6. Consistency telemetry (new, small): in the route, when assessment.score is 'unsatisfactory' but the examiner text matches praise patterns (/exactly right|correct|well done|good answer/i), log a posthog event 'examiner_assessment_mismatch' with session/exchange ids. The harness asserts the event fires on a canned contradictory pair.
Wire into .github/workflows/ci.yml as a separate job IF it can run hermetically (mocked LLM, local supabase via supabase start, or fully mocked DB — pick one and justify in the PR). If hermetic DB is not feasible quickly, run it against mocks only and note the limitation.
```

**Success criteria:** `npm run eval:exam-flow` passes locally and (if hermetic) in CI; deliberately reverting the W2.1 advancement fix makes assertion 1 fail (prove it, then restore).

---

# PHASE 3 — Monetization Enforcement (Stripe)

> **Status 2026-06-10: ✅ PHASE COMPLETE — executed hands-on by Fable 5, deployed to production, 3 payers verified intact.**
> PRs #14–#17 (W3.1–W3.4), each CI-green and squash-merged; migrations `20260610000004/5/6` applied. Post-deploy probe confirmed all 3 `dpe_live/active` payers unchanged (`has_trialed=true` backfilled, guard column NULL). Closes review-05 #1–#18.
> - **W3.1 webhook**: event.created ordering guard (was processing-time no-op); dunning grace (past_due keeps tier); price→tier mapping; new events (refund/dispute/trial_will_end); CHECK widened (paused/incomplete_expired); has_trialed anti-re-trial; idempotency in-flight guard. 10 fixture tests.
> - **W3.2 quotas** (decision D1: voice universal, theft-bounded): get_monthly_usage/get_daily_usage RPCs SUM chars/seconds (was row-count); free TTS budget 500k→35k + STT ~70min; exam respond requires active/unexpired session under exchange cap (free hard, paid flag-gated); abandoned counts toward the 3-exam limit + server-only `discard` action; STT metered; daily caps backstop; hasTtsAccess universal. **All hard-enforce flags seeded OFF (log-only soft launch).**
> - **W3.3 pricing+paywall+courtesy**: pricing page no longer lies (voice/resume free in trial); reason-aware upgrade modal + `paywall_shown`; `paid_equivalent` overrides now grant dpe_live in getUserTier.
> - **W3.4 commercial finish**: Stripe Tax (automatic_tax + customer_update + tax_id_collection); lazy getStripe() everywhere + prod-test-key guard (removed the `null as Stripe` footgun); subscription_events 18-month retention.
>
> **Findings flagged for the owner:**
> 1. **pg_cron is NOT enabled** in production (`cron` schema absent) — the session-lifecycle crons (`expire-trial-exams`, stale-activity, orphan cleanup) from `20260219100002` and the new retention job are not running. Mitigated for trial expiry by W3.2's request-time `expires_at` enforcement. Enable via Dashboard → Extensions → pg_cron, then re-run the schedule blocks (see `docs/runbooks/DATABASE.md`).
> 2. **`dpe_live/none` anomaly**: one user has top tier with no Stripe subscription (likely the owner's comp/test account). Left untouched — changing a user's tier needs owner confirmation.
>
> **Owner actions (from the PRs):** (a) Stripe Dashboard — subscribe the endpoint to `charge.refunded`, `charge.dispute.created`, `customer.subscription.trial_will_end`; (b) enable Stripe Tax registration before next checkout; (c) enable "email customers for successful payments"; (d) optional `ALERT_EMAIL` env; (e) when ready to enforce, flip `quota.*_hard_enforce` flags after reviewing PostHog `*_logonly` events.
> Tests: 1,275 → 1,295.

> Read order for every agent in this phase: `docs/reviews/2026-06-09-comprehensive-review/05-stripe-commercialization.md` in full, including the **Migration safety notes** — two paying users must never be broken.

### Task W3.1: Webhook correctness (ordering, grace, events, mapping)

**Agent:** Fable 5.0 · **Files:** `src/app/api/stripe/webhook/route.ts`, `src/app/api/stripe/checkout/route.ts`, new migration, `src/lib/email.ts` caller, tests

**Goal:** Fix R05 #5 (out-of-order guard no-op), #6 (infinite re-trials), #7 (missing refund/dispute/trial-end handlers), #8 (no dunning grace), #10 (trial reminder never sent), #13 (CHECK constraint poison), #14 (product→tier mapping), #15 (idempotency race) — with the exact production-safe sequencing from the review.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/05-stripe-commercialization.md findings 5-8, 10, 13-15 AND all 8 Migration safety notes. Two paying users exist; the sequencing below is mandatory.

Step 1 — migration (additive, safe): widen the subscription_status CHECK (migration 20260217100001 pattern) to include 'paused' and 'incomplete_expired' (finding 13). Add column user_profiles.last_stripe_event_created timestamptz NULL (new column — do NOT reuse last_webhook_event_ts, whose values are processing-time garbage per finding 5). Add user_profiles.has_trialed boolean default false.

Step 2 — webhook route rewrite (src/app/api/stripe/webhook/route.ts):
a. Ordering guard (finding 5): replace every `const eventTs = new Date().toISOString()` comparison (:212, :244, :280, :309 → guards at :239, :263, :304, :323) with event.created (Stripe epoch seconds → timestamptz) compared against last_stripe_event_created; write the new column. The old column becomes dead — stop writing it; do not drop it in this task.
b. Tier mapping (finding 14): one function mapStripePriceToTier(priceId): reads STRIPE_PRICE_ID_MONTHLY/ANNUAL env (see src/lib/stripe.ts:26-29) → 'dpe_live'; unknown price → log error + default 'checkride_prep' (never silently grant top tier). Use it in all three handlers replacing the hardcoded 'dpe_live' (:130, :214-216, :290-292).
c. Dunning grace (finding 8): on invoice.payment_failed and on subscription.updated with status past_due, KEEP the paid tier; set subscription_status='past_due'; only downgrade tier on customer.subscription.deleted or status in ('unpaid','canceled','incomplete_expired'). Send the existing payment-failed email as is.
d. New events (finding 7+10): handle charge.refunded and charge.dispute.created → set subscription_status appropriately, downgrade tier, send an internal alert email to pd@imagineflying.com via the existing email lib; handle customer.subscription.trial_will_end → call the existing-but-orphaned sendTrialEndingReminder (src/lib/email.ts:113-130), respecting email_preferences.
e. Idempotency race (finding 15): when the dedupe row exists with status='processing' and age < 60s, return 200 without reprocessing.
f. Set has_trialed=true whenever a subscription with trial_end is seen for the user.

Step 3 — checkout (finding 6): in src/app/api/stripe/checkout/route.ts:57, omit trial_period_days when the user's has_trialed is true (read profile server-side).

Step 4 — production sequencing in the SAME release (Migration safety note 1): include in the migration `UPDATE user_profiles SET last_stripe_event_created = NULL WHERE stripe_customer_id IS NOT NULL;` (it's a new column, so this is a no-op formally — the point is the guard starts from NULL and accepts the first real event; verify the .or() guard treats NULL as pass).

Step 5 — PR checklist for the owner (write into PR description): add charge.refunded, charge.dispute.created, customer.subscription.trial_will_end to the Stripe Dashboard webhook endpoint's subscribed events; do NOT replay historical events.

Tests: unit tests with constructed Stripe event fixtures for: out-of-order pair (older created arrives later → rejected), past_due keeps tier, deleted downgrades, refund downgrades+alerts, trial_will_end sends reminder once, re-checkout after has_trialed omits trial, unknown price maps safely, paused status passes CHECK.
```

**Success criteria:** All fixture tests green; Stripe CLI `stripe trigger` smoke run against a test-mode endpoint exercises the new handlers; both paying users' profiles untouched by the migration (verify post-deploy: tier/status unchanged); PR checklist delivered.

---

### Task W3.2: Server-side quota enforcement (requires D1)

**Agent:** Fable 5.0 · **Files:** `src/app/api/exam/route.ts`, `src/app/api/session/route.ts`, `src/app/api/tts/route.ts`, `src/app/api/stt/token/route.ts`, `src/lib/voice/usage.ts`, practice page warning UI, new migration (usage sum RPC), tests

**Goal:** Fix R05 #1, #2, #3, #9, #11, #12 and R04 #2/#10: quotas become real — TTS chars summed, exam tier/exchange caps enforced, trial bypass closed, STT metered, daily hard caps honored — with the soft-landing rollout the review prescribes.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/05-stripe-commercialization.md findings 1-3, 9, 11, 12 + Migration safety notes 2-4, and 04-voice-stack.md findings 2/10/11. Owner decision D1 (RESOLVED): every user INCLUDING free-trial users gets full voice (TTS + STT) — voice is never feature-gated. The free tier is limited by COUNT (3 trial exams, then must subscribe) and by hard anti-theft quotas. Concretely: hasTtsAccess returns true for all tiers; trial users get per-session exchange caps (30) and a trial TTS char budget sized for ~3 × 20-exchange sessions (~35K chars — set as a new trial cap in TIER_FEATURES) plus an STT seconds cap (~70 min trial budget); paid dpe_live keeps its existing caps. All gates below are MANDATORY — they are what "secured from theft" means.

1. TTS char quota (R05 #1): new migration adding RPC get_monthly_usage(p_user_id, p_event_type) returning SUM(quantity) (SECURITY DEFINER, auth.uid() check per the W1.1 pattern, search_path pinned). Use it in /api/tts (route.ts:72-78) instead of the row count. Fix the >/>= off-by-one (usage.ts:47). Per Migration safety note 2: first check docs/reviews/2026-06-09-comprehensive-review/08-production-ground-truth.md section 4 for the two payers' current char usage; if either is over cap, raise it for dpe_live before enforcement. Ship enforcement behind system_config flag quota.tts_hard_enforce, default OFF, log-only for one week (log a posthog event when the sum exceeds cap).
2. Exam route enforcement (R05 #2): in /api/exam respond/next-task — sessionId now mandatory (done in W2.1); load the session and reject status != 'active'; enforce maxExchangesPerSession from TIER_FEATURES: at cap-10 include a warning field in the response (client shows a toast — add minimal UI in practice/page.tsx), at cap return 429 with a clear JSON error the client renders as an upgrade prompt. Per safety note 3, ship behind quota.exchange_hard_enforce, default ON for free tier, log-only for paid tiers for one week.
3. Trial bypass (R05 #3): in /api/session update action, reject client-supplied status='abandoned' (server-only transition — the discard flow must call a dedicated action that the server executes, and abandoned sessions COUNT toward the free-exam limit: change the count at session/route.ts:69 to count all non-onboarding sessions ever created). Enforce expires_at (R05 #12): respond rejects sessions past expires_at with a clear error.
4. STT metering (R05 #9, R04 #10): add an STT branch to checkQuota using usage_logs stt seconds (the client already reports usage via /api/stt/usage — verify and harden: server-side, also meter token issuance: deny new tokens when monthly seconds > tier cap). Enforce the tier gate the token route's docstring claims (stt/token/route.ts:23) consistent with D1.
5. Daily hard caps (R05 #11): implement a cheap check in /api/exam and /api/tts against user_hard_caps from system_config (daily usage_logs sum, TTL-cached 60s per user); behind flag quota.daily_caps_enforce default log-only.
6. Reconcile hasTtsAccess vs TIER_FEATURES (R04 #11) per D1: hasTtsAccess true for every tier; quotas (not feature flags) are the control surface — one source of truth in types.ts.
Tests: unit tests per gate (under/at/over cap; flag on/off); integration test that a free user's 4th exam creation is rejected even after marking priors abandoned.
PR description: rollout plan — flags log-only → owner reviews posthog for false positives → flip to enforce.
```

**Success criteria:** With flags on in a test environment: TTS 429s at the char cap (summed), exam 429s at exchange cap with prior warning, 4th free exam blocked regardless of abandonment, STT token denied over cap; with flags log-only: zero behavior change but events logged; both payers verified unaffected; suite green.

---

### Task W3.3: Pricing truth + upgrade path

**Agent:** Opus 4.8 · **Files:** `src/app/pricing/page.tsx`, practice page paywall modal, `src/lib/instructor-entitlements.ts`/`tier-lookup.ts`, tests

**Goal:** Fix R05 #4 and #16: the pricing page tells the truth per D1; quota hits convert (paywall modal); instructor courtesy access actually grants something.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/05-stripe-commercialization.md findings 4 and 16. Depends on W3.2 (gates exist). Owner decision D1 (RESOLVED): voice for everyone including trials; free tier limited by 3-exam count + trial quotas, not by features. The pricing page must therefore advertise: Free trial = 3 full exams with complete voice experience; Paid = unlimited sessions etc. — fix the rows currently claiming voice/resume are paid-only to match this.

1. Audit every claim on src/app/pricing/page.tsx (rows at :78-80 and the rest of the matrix) against the now-enforced reality from W3.2 + TIER_FEATURES. Fix copy or file a gap — the page and the gates must agree exactly.
2. Build one reusable UpgradeModal component (follow the design language of existing modals in practice/page.tsx): triggered by the 429 quota responses from W3.2 (exchange cap, session cap, TTS cap), shows the specific limit hit + the dpe_live pitch + a checkout CTA hitting /api/stripe/checkout. Wire it in the practice page where those errors surface. Fire a posthog event 'paywall_shown' with {reason}.
3. Instructor courtesy (R05 #16): make user_entitlement_overrides with paid_equivalent actually grant dpe_live in getUserTier (src/lib/voice/tier-lookup.ts) — read the override there (max of base tier, courtesy tier, paid_equivalent→dpe_live), keep the existing never-downgrade semantics, call invalidateTierCache on override writes. Update instructor-entitlements tests.
4. Also call invalidateTierCache from the Stripe webhook handlers on tier change (R05 #17 — best-effort; the 5-min TTL covers other instances).
```

**Success criteria:** Every pricing-page claim demonstrably matches an enforced gate; hitting any cap in a test account shows the modal and the posthog event; a paid_equivalent override user resolves to dpe_live; suite green.

---

### Task W3.4: Commercial finish (tax, receipts, env guard) (requires D3)

**Agent:** Opus 4.8 · **Files:** `src/app/api/stripe/checkout/route.ts`, `src/lib/stripe.ts`, docs/runbooks

**Goal:** Close the remaining commercialization checklist rows: Stripe Tax per D3, receipts, live-mode guard, PII retention.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/05-stripe-commercialization.md findings 18 + checklist rows "Stripe Tax", "Receipts", "Test vs live". Owner decision D3 (RESOLVED): implement Stripe Tax — it was the intent from the beginning.

1. Add automatic_tax: {enabled:true} + customer_update: {address:'auto'} to checkout session creation; PR description instructs the owner to complete Stripe Tax registration in the dashboard FIRST (checkout errors otherwise) and to test in test mode end-to-end before deploy.
2. Live-mode guard: in src/lib/stripe.ts, when NEXT_PUBLIC_APP_ENV==='production' and STRIPE_SECRET_KEY starts with 'sk_test_', throw at module init with a clear message. Also fix the deprecated eager export footgun (stripe.ts:19-24): make the export lazy via getStripe() everywhere (4 routes import it — update them) so a missing env var fails with a readable error.
3. Receipts: PR checklist item for the owner — enable "Email customers for successful payments" in Stripe dashboard settings; verify the app's own confirmation email (webhook :202-207) doesn't duplicate confusingly (adjust copy if both will arrive).
4. PII retention: new migration adding a pg_cron job (pattern from 20260219100002) deleting subscription_events rows older than 18 months; document in docs/runbooks/DATABASE.md.
```

**Success criteria:** Test-mode checkout works with the new settings; prod build with a test key fails fast; cron job created; runbook updated.

---

# PHASE 4 — Voice Stack Hardening (parallel with Phase 5)

> Read order: `docs/reviews/2026-06-09-comprehensive-review/04-voice-stack.md` in full.

### Task W4.1: Voice reliability pack

**Agent:** Opus 4.8 · **Files:** `src/lib/voice/provider-factory.ts`, `tts/*.ts`, `sentence-boundary.ts`, `src/hooks/useDeepgramSTT.ts`, `src/app/api/tts/route.ts`, tests

**Goal:** Fix R04 #3, #4, #5, #7, #8, #14 + the `maxDuration` WARN: runtime fallback that actually runs, STT that survives a dropped socket, Safari that fails loud instead of hanging, and the aviation-decimal boundary bug.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/04-voice-stack.md findings 3, 4, 5, 7, 8, 14 and the incident history section (docs 65-71 context — this stack has burned the owner before; be conservative, change one layer at a time, do not touch the MP3/HTMLAudioElement playback architecture).

1. Runtime TTS fallback (finding 3): refactor so the fallback chain wraps synthesize() calls, not module import (provider-factory.ts:14-33). On provider error/timeout → try the next provider in the chain; log a voice-telemetry event with provider+error class. 
2. Timeouts (finding 4): AbortSignal.timeout(8000) + one retry on the upstream fetches in deepgram-tts.ts:64 and cartesia-tts.ts:40, then fall through to the chain.
3. Sentence boundary (finding 5): in sentence-boundary.ts isFAAReference (:114-121), the general \d+\.\d+ window check must require a digit IMMEDIATELY after the period (the dedicated isDecimalNumber already does this — delete the redundant general fallback). Add test cases: "…121.5. What would you do?" splits after "121.5."; "per 91.205 you need…" does not split inside the reference; "14 CFR 61.109." handled.
4. STT reconnect (finding 7): in useDeepgramSTT.ts, on abnormal WS close while !userStopped: stop the MediaRecorder, reconnect using the cached token (10-min TTL), restart the recorder, expose a 'reconnecting' state the practice page can render; cap at 2 reconnect cycles then surface the existing error state and STOP the mic tracks (fix the hot-mic leak at :203-215).
5. Safari capture (finding 8): probe 'audio/mp4' as MediaRecorder fallback (Deepgram accepts AAC); wrap recorder construction in try/catch that REJECTS the connect promise; add a 10s connect timeout so startListening can never hang.
6. Fallback model (finding 14): switch openai-tts.ts from tts-1 to gpt-4o-mini-tts (verify the API shape via the claude-api/openai docs at implementation time).
7. Add `export const maxDuration = 30` (or appropriate) to /api/tts route (doc 61/62 WARN).
8. Update the contract tests (voice-stack-contract, deepgram-tts-contract, sentence-boundary tests) for all changes. Manual verification checklist in the PR: Chrome + Safari (macOS) + iOS Safari: full voice exchange, mid-answer network drop (toggle Wi-Fi), TTS provider 500 (mock) → audible fallback voice.
```

**Success criteria:** Mocked Deepgram 500 produces audio via fallback (test); WS drop mid-answer recovers within ~3s in manual test, no hot mic after failure; "121.5." splits correctly; Safari < 18.4 path errors visibly instead of hanging; suite green.

---

### Task W4.2: Premium voice tier — make it real or delete it (requires D2)

**Agent:** Opus 4.8 · **Files:** `src/lib/voice/types.ts`, `tts/` adapters, `src/lib/voice/usage.ts`, settings/voicelab pages, dead-code removal

**Goal:** Resolve R04 #1, #11, #12, #13: the tier/provider story in code matches what's sold; the March-incident dead code is gone.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/04-voice-stack.md findings 1, 11, 12, 13 AND 12-voice-economics-d2.md (the financial analysis). Owner decision D2 (RESOLVED 2026-06-09): commit to Aura-2 single-provider — execute the "commit to Aura-2" branch below; the premium-provider branch is dead. Depends on W4.1 (runtime fallback exists).

If D2 = ship premium voice (ElevenLabs or Cartesia):
1. New adapter src/lib/voice/tts/<provider>-tts.ts implementing the TTSProvider interface with **MP3 container output only** (the playback path is HTMLAudioElement MP3 — the March 2026 incident came from PCM; do not introduce PCM on web). API key via env; add to .env.example.
2. TIER_FEATURES (types.ts:57-85): dpe_live.ttsProvider = the new provider; checkride_prep stays deepgram. Fallback chain: premium → deepgram → openai via W4.1's runtime chain.
3. Voice selection: map the existing DPE persona voice options (system_config voice.user_options, settings page, voicelab) to provider voice IDs; the admin voicelab page must be able to A/B the new voices.
4. Cost guard: log chars to usage_logs as today; confirm W3.2's summed quota applies.
If D2 = commit to Aura-2 single-provider: update TIER_FEATURES comments, marketing copy on pricing page ("premium voice" claims), and CLAUDE.md to stop claiming Cartesia.
Either way:
5. Delete dead code: src/hooks/useStreamingPlayer.ts, public/audio-worklet/pcm-playback-processor.js, browser-detect.ts supportsSpeechRecognition, and (if D2 ≠ Cartesia) cartesia-tts.ts. Grep for imports first; remove the audio-worklet CSP allowance if one exists.
6. Reconcile hasTtsAccess with TIER_FEATURES (one source of truth) if not already done in W3.2.
Manual check: full voice exam on dpe_live test account in Chrome + Safari.
```

**Success criteria:** dpe_live audibly uses the decided provider (or claims are corrected everywhere); zero references to deleted dead code; suite + contract tests green; Safari unaffected.

---

### Task W4.3: STT accuracy + latency upgrades

**Agent:** Opus 4.8 · **Files:** `src/app/api/stt/token/route.ts`, `src/app/api/tts/route.ts` auth/quota caching, eval script

**Goal:** Fix R04 #9 (aviation vocabulary silently disabled) and #6 (3 serial DB hits per TTS sentence); pilot Deepgram Flux end-of-turn behind a flag.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/04-voice-stack.md findings 6, 9 and Market assessment item 2.

1. Keyterm vocabulary (finding 9): the WS URL builder (stt/token/route.ts:114-125) dropped vocabulary boosting because Nova-2's `keywords=` param broke the handshake — Nova-3 uses `keyterm=`. Re-add a curated aviation list (~25 terms: METAR, TAF, NOTAM, VOR, ILS, ADS-B, AIRMET, SIGMET, Vso, Vx, Vy, Va, Vno, Vne, magneto, carburetor, density altitude, transponder, sectional, Class Bravo/Charlie/Delta, CFIT, IMSAFE, PAVE, ARROW) via keyterm params. Verify against current Deepgram docs that keyterm is Nova-3's parameter and note the pricing add-on in the PR. Test the handshake with a real token in dev; if Deepgram rejects >N params, batch to the documented limit.
2. TTS route latency (finding 6): cache the auth lookup per (user, session) for 60s via the existing ttl-cache lib so per-sentence calls skip 2 of the 3 serial DB hits (system_config is already TTL-cached — verify); keep the quota check but read it from the same cached window with a small overshoot tolerance (document: worst-case overshoot = cap + 60s of synthesis).
3. Flux pilot (flagged, OFF): add system_config flag stt.flux_pilot; when on, the token route builds the Flux endpoint/params per current Deepgram docs (model-based end-of-turn replacing utterance_end_ms=1500). Client: when the flag payload indicates flux, trust server-pushed end-of-turn instead of the silence timer (useDeepgramSTT.ts). Keep Nova-3 the default; this is an A/B lever for the owner.
4. Extend scripts/eval (or add scripts/eval/stt-aviation-accuracy.ts): given a small set of recorded aviation phrases (generate via TTS as fixtures), measure WER with/without keyterm — even a rough harness beats none. Document results in the PR.
```

**Success criteria:** Handshake succeeds with keyterms (live dev test); per-sentence TTS server time drops measurably (log timings before/after); Flux flag path connects when enabled in dev; suite green.

---

# PHASE 5 — Drop the Graph, Build the Scenario Engine (parallel with Phase 4)

> Owner decision D4 (2026-06-09): the knowledge graph leaves the exam runtime. Its replacement for non-linear exams is the **Scenario Engine** — designed in full in `docs/plans/2026-06-09-scenario-engine-design.md` — which must **prove it works** through two predefined gates (W5.5 offline eval, W5.6 production A/B) before its flag turns on. Until then, exams run linear exactly as today.
> Read order for every agent in this phase: the Scenario Engine design doc in full, plus whatever sections of `03-knowledge-graph-rag.md` / `13-non-linear-exam-alternatives.md` the task names.
> Dependencies: W5.1/W5.2 can run any time after Phase 2; W5.3–W5.6 build on W2.1 (server-side state ownership) and run strictly in order.

### Task W5.1: Remove the knowledge graph from the exam runtime

**Agent:** Opus 4.8 · **Files:** `src/lib/exam-engine.ts`, `src/lib/exam-planner.ts`, `src/lib/graph-retrieval.ts`, `src/app/api/exam/route.ts`, new migration, admin graph page banner, `CLAUDE.md`, tests

**Goal:** Execute D4: graph context injection, evidence-chain fingerprints, and graph flags leave the exam path; data and admin explorer stay as a read-only archive; dead RPCs dropped. The exam runs pure chunk-RAG + linear planner until the Scenario Engine passes its gates.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/plans/2026-06-09-scenario-engine-design.md §9 and docs/reviews/2026-06-09-comprehensive-review/03-knowledge-graph-rag.md findings 2, 8, 11, 13. Owner decision: the graph is OUT of the exam runtime.

1. Exam engine: remove graphContext fetching/injection from both Claude calls — generateExaminerTurn/Streaming (exam-engine.ts:268-269, 326-327, 406-408) and assessAnswer's "VERIFIED REGULATORY CLAIMS" block (exam-engine.ts:729-732); remove the shadow-mode console.log path (exam-engine.ts:273-275); remove the get_concept_bundle call and the elementCode plumbing for it in the exam route (route.ts:616-617 area).
2. Planner: remove the evidence-chain fingerprint loader (exam-planner.ts:113-115,127 and the concepts/slug query) — buildStructuralFingerprints (the current production-reality fallback) becomes the explicit, only implementation until W5.3 replaces it with element_adjacency. Delete the now-unreachable code, not comment it out.
3. graph-retrieval.ts: the exam path no longer imports it. If the admin graph explorer or scripts still use parts, keep the file trimmed to those needs; otherwise delete it and its tests. Grep for all importers first and list them in the PR.
4. Migration: DROP FUNCTION hybrid_search and get_related_concepts (dead RPCs, finding 2 — verify zero app callers; update scripts/audit/db-snapshot.ts:271-272 which references them). Set system_config graph.enhanced_retrieval=false and graph.shadow_mode=false via the migration's seed-update pattern. Do NOT drop concepts/concept_relations/concept_chunk_evidence tables or get_concept_bundle (admin explorer uses it) — they are archive.
5. Admin graph explorer ((admin)/admin/graph): add a visible banner: "Archived experiment — not used in the exam path since 2026-06. See docs/plans/2026-06-09-scenario-engine-design.md."
6. CLAUDE.md: update Key Architecture Decisions + RPC list + Known Limitations — non-linear exams are delivered by the Scenario Engine (link the design doc); graph described as archived data.
7. Remove/adjust graph-dependent tests (graph-retrieval tests, any exam-engine tests asserting graph context); full suite green. Run 3 manual exam exchanges in dev to confirm identical UX minus graph context.
Note: per-exchange input tokens should DROP measurably (the graph injected 1-3K tokens × 2 calls) — record before/after from usage_logs in the PR description.
```

**Success criteria:** Zero graph code reachable from `/api/exam`; dead RPCs dropped; flags off; admin explorer still renders with the banner; CLAUDE.md truthful; suite green; measured token-per-exchange reduction reported.

---

### Task W5.2: Retrieval economy (chunk-RAG)

**Agent:** Opus 4.8 · **Files:** `src/lib/exam-engine.ts`, migration (two-stage hybrid search), tests

**Goal:** Fix R03 #3 (HNSW bypassed), #4 (stale embeddings served), #12 (serial image fetch) and add Anthropic prompt caching — the economy work that survives the graph's removal, and the prerequisite for the Scenario Engine's cheap cached scenario block. Depends on W5.1 (graph already out).

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/03-knowledge-graph-rag.md findings 3, 4, 12. Depends on W5.1 (graph context already removed from both Claude calls).

1. Anthropic prompt caching: add cache_control: {type:'ephemeral'} breakpoints to the static prefix of both calls (system prompt + persona + safety prefix — the parts identical across a session's exchanges; the Scenario Engine will later pin its scenario block inside this cached prefix, so structure the prompt assembly with a clearly-delimited "session-static" region). Read the current SDK shape via the claude-api skill / Anthropic docs at implementation time (SDK ^0.74.0 supports it). Measure: log cache_read_input_tokens / cache_creation_input_tokens into the existing logLlmUsage metadata so savings are visible in usage_logs.
2. Assessment context diet: with the graph gone, assessAnswer's context is RAG chunks + history. Trim: pass at most 3 chunks (vs the examiner's 5) to the assessment call — assessment needs grounding for the specific claim, not breadth. Verify assessment quality on 10 sample exchanges before/after (spot-check, document in PR).
3. Two-stage hybrid search (finding 3): migration CREATE OR REPLACE chunk_hybrid_search (20260214000005:106-150): stage 1 CTE `ORDER BY embedding <=> q LIMIT 50` (HNSW-eligible) + a FTS candidate CTE, stage 2 blend/re-rank the union with the existing 65/35 weights and threshold. Keep the function signature identical (drop-in). Add embedding_status IS DISTINCT FROM 'stale' to the WHERE clause (finding 4). Verify with EXPLAIN that the index is used; include the EXPLAIN output in the PR.
4. Image fetch (finding 12): make get_images_for_chunks run in parallel with the chunk search consumption instead of sequentially after it (exam-engine.ts:277-279).
5. Before/after numbers: run 10 simulated exchanges and report input-token totals per call and retrieval latency from timing spans.
```

**Success criteria:** Cache hits visible in usage_logs after exchange 2 of a session; input tokens per exchange reduced (report numbers, stacked on W5.1's reduction); EXPLAIN shows index usage; retrieval results remain relevant (spot-check 5 queries before/after); suite green.

---

### Task W5.3: Element adjacency layer

**Agent:** Opus 4.8 · **Files:** Create `scripts/pipeline/build-element-adjacency.ts`, new migration (`element_adjacency` table), `src/lib/exam-logic.ts`/`exam-planner.ts` integration, QC report, tests

**Goal:** Build the Scenario Engine's relatedness layer (design §3): a precomputed, inspectable, CFI-auditable table of related ACS elements that replaces both the dropped graph traversal and the keyword-Jaccard fingerprints.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/plans/2026-06-09-scenario-engine-design.md §3 — it is the spec for this task. Depends on W5.1.

1. Migration: create element_adjacency exactly per design §3 (element_code, related_code, score numeric, signals jsonb, built_at, PK on the pair; FKs to acs_elements(code); RLS read-authenticated/write-service-only). Index on element_code.
2. Build script scripts/pipeline/build-element-adjacency.ts (npm run pipeline:element-adjacency), per rating:
   a. Embed all elements of the rating with text-embedding-3-small over "{code} {element text} — task: {task title}, area: {area title}" (reuse the embedding patterns from scripts/pipeline/embed-concepts.ts incl. the embedding_cache).
   b. Source co-occurrence: for each element, run chunk_hybrid_search top-10 on the element text; compute pairwise Jaccard over chunk-id sets.
   c. Structural prior: same task 1.0 / same area 0.5 / else 0.
   d. Blend 0.60/0.25/0.15, keep top k=12 neighbors with score >= 0.35, store signals breakdown in jsonb. Honor a stoplist file (scripts/pipeline/element-adjacency-stoplist.json, create empty) excluding listed pairs on rebuild.
   e. Idempotent: delete-and-rebuild per rating in a transaction.
3. QC report (mandatory output, docs/reviews/2026-06-09-comprehensive-review/14-adjacency-qc.md): 30 random elements with their neighbor lists (code + element text + score + signal breakdown), plus the 50 highest-scoring cross-AREA pairs. Flag this report for owner (CFI) review in the PR — nonsense pairs go into the stoplist and rebuild.
4. Planner integration behind system_config flag exam.adjacency_ordering (default OFF): when on, pickNextElement (exam-logic.ts:534-548 area, post-W2.1 shape) ranks candidate next elements by adjacency to the current element instead of structural-fingerprint Jaccard; when off, behavior unchanged. The W5.4 transition policy will consume the same table.
5. Run the build for all 3 ratings against production (write is to the new table only — zero risk to existing data). Tests: blend math unit tests; planner ordering test with a seeded adjacency fixture.
```

**Success criteria:** Table populated for PA/CA/IR (~2,174 × ≤12 rows); QC report delivered and owner-reviewed; flag-off behavior byte-identical to today; flag-on planner ordering follows adjacency in tests; suite green.

---

### Task W5.4: Scenario Engine core

**Agent:** Fable 5.0 · **Files:** Create `src/lib/scenario-engine.ts`, modify `src/lib/exam-engine.ts`, `src/app/api/exam/route.ts`, `src/lib/exam-planner.ts`, fallback scenario templates, tests

**Goal:** Implement design §4 (scenario spine) and §5 (transition policy) behind flag `exam.scenario_engine` (default OFF). The exam becomes scenario-driven and non-linear when the flag is on; byte-identical to linear when off.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/plans/2026-06-09-scenario-engine-design.md §§4-6 and §8 — they are the spec. Depends on W2.1 (server-side state + advancement), W5.2 (cached prompt prefix structure), W5.3 (element_adjacency). Build behind system_config flag exam.scenario_engine, default OFF; every change must be a no-op when the flag is off (assert this with a test).

1. New module src/lib/scenario-engine.ts:
   - generateScenarioSpine(plan, rating, sessionConfig, persona): one Claude call producing the design-§4 JSON (scenario, hooks, events); validate with a zod-style schema; hooks[].element_code must exist in the plan (drop strays); one retry on invalid JSON, then fall back to a template from src/lib/scenario-templates.ts (WRITE these: 3 complete, aviation-plausible scenarios per rating — PA/CA/IR — with generic hooks; aviation accuracy matters, ground them in the rating's typical aircraft and mission profiles).
   - buildTransitionShortlist(plannerState, examPlan, adjacency, scenario): the design-§5 ranked 5-candidate list with the 0.45/0.25/0.20/0.10 blend (adjacency / coverage_urgency / weak_area_weight / hook_bonus). Pure function, fully unit-tested with fixtures (urgency raises underrepresented areas; used hooks lose their bonus; pending-only candidates).
   - parseTransitionChoice(examinerText): extract <next_element>CODE</next_element>; strip the tag from the user-visible/TTS text.
2. Exam start (route start action): when flag on, call generateScenarioSpine in parallel with first-question generation (design §6: first question uses the spine only if it resolved in time, else linear opener and the spine attaches from exchange 2). Persist to exam_sessions.metadata.scenario via the read-merge-write pattern from W2.1. Load the plan's adjacency rows once and persist the per-element neighbor map in metadata (design: zero per-exchange DB round trips).
3. System prompt: render the scenario as a delimited EXAM SCENARIO block inside the session-static cached region established by W5.2. The examiner instructions gain (flag-on only): anchor questions in the scenario where natural; never contradict scenario facts.
4. Respond path: at the W2.1 advancement decision point, when flag on and advancing: append the design-§5 transition addendum (shortlist + bridge instruction + <next_element> protocol) to the examiner prompt; server validates the emitted code ∈ shortlist, advances the planner to it; missing/invalid → advance to top-ranked candidate (never stall). Log a scenario_transition telemetry row (posthog + timing metadata): {chosen, topRanked, followedLlm: bool}. Events: when a spine event's trigger matches (area completed / exchange count), include it in the next transition addendum.
5. Token budget guard (design §6): assert in code that the transition addendum stays ≤ 500 tokens (truncate candidate descriptions if needed); log actual prompt sizes to usage_logs metadata.
6. Tests: schema validation incl. retry+template fallback; shortlist ranking fixtures; tag parsing (present/absent/garbage); flag-off no-op test; an integration test (mocked Claude) running 8 exchanges flag-on asserting: every advance lands on a shortlist member, scenario block present in prompts, coverage/grading writes identical in shape to flag-off.
Do NOT enable the flag anywhere. W5.5 is the gate.
```

**Success criteria:** Flag off: byte-identical behavior (test-proven). Flag on in dev: a full exam runs scenario-anchored with natural bridges, every transition validated server-side, plan coverage and grading unchanged in shape; transition telemetry flowing; addendum ≤ 500 tokens measured; suite green.

---

### Task W5.5: Scenario Engine Gate 1 — offline judged evaluation

**Agent:** Fable 5.0 · **Files:** Create `scripts/eval/scenario-engine-eval.ts`, fixtures, output report

**Goal:** Prove the Scenario Engine beats the linear baseline before any user sees it — design §7 Gate 1, with its predefined acceptance numbers. The `exam.scenario_engine` flag may not be enabled for users until this gate passes.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/plans/2026-06-09-scenario-engine-design.md §7 (Gate 1 — the acceptance numbers are binding) and §6 (budgets). Depends on W5.4 merged. Also read docs/system-audit/29 - Exam Quality Harness and Calibration.md for the grounding methodology to reuse.

Build scripts/eval/scenario-engine-eval.ts (npm run eval:scenario-engine):
1. Sample 40 elements stratified across the 3 ratings and element types (K and R). For each, construct a simulated mid-exam state: a 3-exchange conversation tail (canned but element-appropriate), a partial plan with pending elements, and (scenario arm) a generated spine.
2. Two arms per element, same persona/difficulty, temperature 0 where supported:
   - LINEAR (control): current production behavior — next element by linear plan order, no scenario context, standard transition.
   - SCENARIO: the W5.4 path — spine in prompt, transition shortlist, bridge instruction.
3. Blind LLM judge (Claude, separate call, arm order randomized, judge never told which is which): per pair, rank on (a) cross-topic probing quality (headline), (b) transition naturalness from the conversation tail, (c) factual accuracy, (d) element specificity, (e) citation grounding. Winner per dimension + overall.
4. Grounding check: run the doc-29 unsupported-citation methodology on both arms (reuse scripts/eval/run-regulatory-assertions.ts tooling where possible).
5. Coverage integrity: run the W2.6 exam-flow regression harness with exam.scenario_engine on — plans must complete identically (100%).
6. Budgets: measure actual spine-call cost/latency and per-exchange addendum tokens against design §6.
7. Output docs/reviews/2026-06-09-comprehensive-review/15-scenario-gate1-report.md: win rates + binomial CIs per dimension, grounding rates per arm, budget measurements, 5 best/worst pairs verbatim, and an explicit PASS/FAIL against every Gate 1 criterion from design §7 (overall >=65%, cross-topic >=70%, accuracy/grounding non-inferiority >=45%, coverage 100%, budgets met).
Budget guard: estimate API cost first (40 pairs x ~4 calls); cap ~$15; reduce sample if needed and say so.
If the gate FAILS: do not iterate blindly — write a failure analysis (which dimension, with examples) and stop; prompt-tuning iterations are a follow-up task with this same script as the fixed yardstick.
```

**Success criteria:** Report exists with an explicit per-criterion PASS/FAIL verdict; raw pairs preserved; if PASS, the flag is cleared for Gate 2 (W5.6); if FAIL, a precise failure analysis exists and the flag stays off.

---

### Task W5.6: Scenario Engine Gate 2 — production A/B and rollout

**Agent:** Opus 4.8 · **Files:** A/B assignment in exam start, PostHog events/dashboard queries, `scripts/audit/scenario-ab-report.ts`, W2.6 harness extension, rollout runbook

**Goal:** Design §7 Gate 2: prove the engine in production with guardrails, then roll out to 100% — or roll back on data. Requires W5.5 PASS.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/plans/2026-06-09-scenario-engine-design.md §7 Gate 2 (binding) and §8. Requires the Gate 1 PASS report (docs/reviews/2026-06-09-comprehensive-review/15-scenario-gate1-report.md) — verify it exists and says PASS before proceeding; STOP otherwise.

1. A/B assignment: at exam start, when system_config exam.scenario_engine = 'ab', assign 50/50 by stable hash of user_id (sticky per user, not per session); persist the arm in exam_sessions.metadata; emit posthog event exam_arm_assigned. Flag values: off | ab | on.
2. Metrics plumbing: ensure these are queryable per arm: exchanges per session, session completion rate, report-rate (/api/report), examiner_assessment_mismatch rate (from W2.6's telemetry), p95 first-token latency (latency_logs), scenario_transition followedLlm rate.
3. scripts/audit/scenario-ab-report.ts (npm run audit:scenario-ab): pulls the per-arm comparison from posthog + DB, prints the Gate 2 table with the design-§7 thresholds (engagement non-inferior, guardrails not elevated, latency within +10%) and sample sizes; flags when n >= 200/arm or 2 weeks elapsed.
4. Owner qualitative review support: script flag --transcripts dumps 20 random scenario-arm transcripts (examiner/student text only) to a local file for the CFI realism checklist in design §7.
5. Harness extension: add the design-§7 scenario assertions to the W2.6 regression (spine JSON validates; every transition is a shortlist member; scenario facts string-consistent across examiner turns).
6. Runbook docs/runbooks/SCENARIO-ROLLOUT.md: enable 'ab' → monitor weekly via the report → at threshold, owner reviews transcripts → flip to 'on' (or back to 'off'), each step with the exact commands/queries.
PR description: the rollout decision itself is the owner's, made from the report — this task delivers the machinery and the runbook.
```

**Success criteria:** A/B assignment sticky and balanced (verified on staging); report script produces the Gate 2 table with real data; harness extended; runbook delivered; rollout/rollback is a one-flag operation.

---

# PHASE 6 — Operations, Compliance, Launch Polish

### Task W6.1: Error tracking + real alerting

**Agent:** Opus 4.8 · **Files:** Sentry integration (instrumentation files, next.config), `/api/health` enrichment, alert wiring docs

**Goal:** Close the "single-operator, no alerting" launch caution (R01 launch-gate; R06 ops): unhandled errors page someone; uptime is externally watched.

**Prompt:**
```
Repo: aviation-oral-exam-companion (Next.js 16 App Router on Vercel). Read docs/reviews/2026-06-09-comprehensive-review/06-security-db-infra.md "Operational gaps" and 01-docs-synthesis.md alerting items.

1. Integrate @sentry/nextjs (wizard-style config: instrumentation.ts, client/server/edge configs, source maps via Vercel integration): capture unhandled exceptions in API routes and client; tag with route + user tier (no PII beyond user id); sample traces at 10%. Env-gate: only init when SENTRY_DSN is set. Add to .env.example.
2. Wrap the per-exchange write chain's catch blocks (the console.error sites in src/app/api/exam/route.ts:621-624, 702, 714, 733 — post-W2.2 locations) with Sentry.captureException so silent data-loss failures become visible.
3. Enrich /api/health: check DB reachability (cheap select), Anthropic/Deepgram key presence, and return {status, checks:{db,config}} with proper 503 on failure.
4. Alerting wiring (owner actions, documented in docs/runbooks/ALERTING.md): Sentry alert rule → email pd@imagineflying.com on new issue + error-rate spike; external uptime check (UptimeRobot/Better Stack free tier) on /api/health every 5 min → email/SMS; Stripe webhook failure notifications (dashboard setting). Write the runbook with exact click-paths; flag which steps only the owner can do.
5. Vercel cron failure visibility: cron routes already log — add Sentry capture on caught failures in both cron routes.
```

**Success criteria:** Thrown test error appears in Sentry with route tag; /api/health 503s when DB env is broken (local test); runbook delivered; owner-action checklist explicit.

---

### Task W6.2: Load test the cost-bearing paths

**Agent:** Opus 4.8 · **Files:** Create `scripts/load/k6-exam.js`, `scripts/load/k6-voice.js`, report doc

**Goal:** Close the "first real traffic will be the test" gap (R01): know the app's concurrency ceiling and failure mode before marketing pushes traffic.

**Prompt:**
```
Repo: aviation-oral-exam-companion. The app has NEVER been load tested (docs/system-audit/62 was static analysis only). Build a k6 suite targeting a PREVIEW deployment (never production):

1. scripts/load/k6-exam.js: simulate N concurrent exam sessions: start → 5 respond exchanges (use a dedicated load-test user pool — create 20 test users via a setup script with a clearly marked email pattern loadtest+n@..., and a system_config flag or env check ensuring the preview env uses MOCKED LLM responses (add a LOAD_TEST_MOCK_LLM env to the exam route that returns canned SSE when set — never deployable to prod: guard on VERCEL_ENV !== 'production').
2. scripts/load/k6-voice.js: concurrent /api/tts requests (short sentences) + /api/stt/token issuance.
3. Stages: ramp 1→10→25→50 VUs, 2 min each. Record p95 latency, error rate, and Vercel function duration/limit behavior.
4. Run against a preview deployment; collect Supabase connection counts during the run (pooler saturation is the expected first bottleneck — check via dashboard or pg_stat_activity).
5. Report docs/reviews/2026-06-09-comprehensive-review/09-load-test-report.md: ceiling found, first failure mode, p95 at 25 VUs, recommendations (connection pooling settings, maxDuration values, any 429 tuning), and a "safe concurrent users" number for the launch dashboard.
Cleanup: delete load-test users after the run.
```

**Success criteria:** Report exists with a measured ceiling and failure mode; mock guard provably cannot run in production; test users cleaned up.

---

### Task W6.3: Data lifecycle + GDPR self-service

**Agent:** Fable 5.0 · **Files:** New migrations (retention crons, FK fixes), `src/app/(dashboard)/settings/page.tsx`, new `/api/user/export` + delete flow, tests

**Goal:** Close R06 D2-D4 (unbounded tables, FK gaps) and R01's GDPR/account-deletion items (also an App Store requirement for mobile later).

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/06-security-db-infra.md D2-D4 and 01-docs-synthesis.md GDPR items.

1. Retention migration: pg_cron jobs (pattern: 20260219100002) deleting latency_logs > 90 days and usage_logs > 13 months (keep 13 for year-over-year billing questions); document in docs/runbooks/DATABASE.md. session_transcripts/element_attempts are user data — NOT auto-deleted.
2. FK hygiene migration: usage_logs.session_id → ON DELETE SET NULL; usage_logs.user_id → ON DELETE CASCADE (align with user_profiles).
3. Data export: GET /api/user/export — authenticated, rate-limited (1/hour), streams a JSON file: profile, exam_sessions, session_transcripts (q/a/assessment only, not rag_chunks), element_attempts, email_preferences. 
4. Account deletion: settings page "Delete account" with type-to-confirm → POST /api/user/delete → server-side: cancel active Stripe subscription if any (stripe.subscriptions.cancel), delete auth user via service-role admin API (auth.admin.deleteUser) and let FK cascades handle profile/sessions (verify cascade coverage table-by-table for all 34 tables; for service-only tables without user FK cascade — subscription_events by customer id, support_tickets — delete explicitly). Send a confirmation email. Add a 'account_deleted' posthog event (no user id after deletion — use a hash).
5. Tests: export shape test; deletion test against local/staging proving zero rows remain keyed to the user across all user-keyed tables (write the verification query into the test).
PR note: this satisfies both GDPR and the Apple account-deletion requirement the mobile app will need.
```

**Success criteria:** Export downloads complete user data; deletion removes every user-keyed row (verified by query) and cancels Stripe; crons scheduled; suite green.

---

### Task W6.4: Analytics completion + docs truth pass

**Agent:** Opus 4.8 · **Files:** analytics call sites, `CLAUDE.md`, `docs/system-audit/00 - Index.md` annotations

**Goal:** Ship the 11 deferred PostHog events (R01) so launch decisions have funnel data; make CLAUDE.md and the audit index stop lying (R01 contradictions).

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/01-docs-synthesis.md (deferred backlog item 2, contradictions 1-4, 12).

1. Inventory the 11 deferred PostHog events: find the original event list (grep docs/system-audit for the event inventory — docs 40/54/61 reference it; reconcile the three conflicting counts and produce the definitive list in the PR). Implement each via the existing src/lib/analytics.ts / posthog-server.ts patterns. Likely set: voice_mode_toggled, exchange_completed, assessment_scored, session_resumed, quota_warning_shown, paywall_shown (done in W3.3 — verify), upgrade_clicked, onboarding_completed, instructor_invite_sent, weak_area_drill_started, settings_voice_changed. Respect cookie consent gating as existing events do.
2. CLAUDE.md truth pass: fix the documented contradictions — test count (run vitest, use the real number), KG runtime status (post-D4 reality), STT browser support wording (Deepgram is cross-browser; the Chrome-only claim was the legacy Web Speech API), DB scale numbers (use docs/reviews/2026-06-09-comprehensive-review/08-production-ground-truth.md), RPC list (chunk_hybrid_search/get_concept_bundle are production; note the W1.1 auth hardening). Update the Known Limitations section to reflect Phases 0-6 of this plan.
3. Add a dated banner to docs/system-audit/00 - Index.md: "Historical record. Superseded by docs/reviews/2026-06-09-comprehensive-review/ and docs/plans/2026-06-09-launch-readiness-master-plan.md for current state."
```

**Success criteria:** Events visible in PostHog from a test session; CLAUDE.md contains zero claims contradicted by the ground-truth doc; suite green.

---

### Task W6.5: Compliance pages + first-exam disclaimer

**Agent:** Opus 4.8 · **Files:** practice page modal, new accessibility page, consent persistence, footer links

**Goal:** Close R01 §2.2 items: FAA-disclaimer acknowledgment at first exam, accessibility statement, server-side consent record.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/01-docs-synthesis.md open issues (doc 40 §2.2 items).

1. First-exam disclaimer modal: before the first exam start ever (track via user_profiles or a metadata flag), show a modal: HeyDPE is a study aid, not an FAA-approved testing device; AI can make mistakes; verify against current FARs/ACS; not a substitute for instruction from a certificated flight instructor. Require explicit acknowledgment; record acknowledged_at server-side (user_profiles column via migration). Reuse the existing modal design language.
2. Accessibility statement page /accessibility: honest current state (keyboard navigation, screen-reader status untested, contact for issues), linked from Footer.tsx alongside privacy/terms.
3. Server-side consent record: when CookieConsent choices are made, also POST them to a new lightweight endpoint persisting {user_id (if authed), choices, timestamp, user_agent} to a consent_records table (new migration, RLS user-reads-own/service-writes). Keep localStorage behavior unchanged for anonymous visitors; sync on login.
4. Verify terms/privacy pages reference the refund promise consistently with W3.1's refund handling (7-day refund per terms:188-193 — flag any mismatch to the owner rather than editing legal copy yourself).
```

**Success criteria:** New users must acknowledge before exam 1 (existing users on next exam); acknowledgment row visible in DB; /accessibility live and linked; consent rows persist for logged-in users.

---

# PHASE 7 — Launch Gate

### Task W7.1: Build the real final gate

**Agent:** Fable 5.0 · **Files:** Create `scripts/audit/public-launch-final-gate.ts`, npm script, CI hook

**Goal:** Build the 16-check consolidated gate that doc 64 scoped but never created (R01) — extended with checks that would have caught this review's critical findings — and run it.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/system-audit/64 - Public Launch Final Gate Re-run.md (the never-built spec) and docs/reviews/2026-06-09-comprehensive-review/00-README.md. Depends on Phases 0-6 merged.

Build scripts/audit/public-launch-final-gate.ts (npm run audit:final-gate), single process, table output, exit 0 only if every BLOCKER passes:
Checks (mark each BLOCKER or WARN):
1-9. Port the existing 9 checks from scripts/audit/public-launch-gate.ts.
10. [BLOCKER] RPC auth: with a real authenticated non-admin JWT (env-provided test creds), get_element_scores for a different user id returns error/empty.
11. [BLOCKER] Anon PII: anon-key REST select of instructor_profiles.certificate_number returns nothing.
12. [BLOCKER] IDOR: respond with another user's sessionId → 404.
13. [BLOCKER] Quota reality: TTS quota RPC returns a char SUM (not row count) — call get_monthly_usage and cross-check against a raw sum query.
14. [BLOCKER] Webhook ordering: unit-level — feed two fixture events out of order through the handler logic, assert older-created is rejected.
15. [BLOCKER] Planner advancement: run the W2.6 exam-flow regression (invoke its assertions or shell out to npm run eval:exam-flow).
16. [WARN] Flags sane: graph.enhanced_retrieval and graph.shadow_mode off (graph dropped, W5.1); exam.scenario_engine in its gated state (off or ab — never on without the Gate 1 PASS report existing); quota.* enforcement flags in their intended launch state; kill switches all off; maintenance_mode off.
17. [WARN] Ops: SENTRY_DSN set in prod env (Vercel API or env presence proxy), CRON_SECRET set, UPSTASH vars set.
18. [WARN] Pricing/enforcement parity: re-assert the W3.3 claims table (encode the expected matrix in the script).
Wire as a manual workflow_dispatch job in CI (needs secrets) + document in docs/runbooks/. Run it against production and commit the output to docs/reviews/2026-06-09-comprehensive-review/10-final-gate-result.md.
```

**Success criteria:** Gate runs clean (all blockers green) against production; result committed; gate documented as the standing pre-marketing-push ritual.

---

### Task W7.2: Launch decision pack

**Agent:** Fable 5.0 · **Files:** Create `docs/reviews/2026-06-09-comprehensive-review/11-launch-decision-pack.md` + Obsidian note

**Goal:** A one-document GO/NO-GO for full commercialization that Piotr can read in 15 minutes: what was fixed, what's verified, what's accepted-risk, what the marketing push may safely scale to.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Depends on W7.1 green. Read the final-gate result, the load-test report (09), the graph eval (graph-reports), and the master plan task statuses.

Write docs/reviews/2026-06-09-comprehensive-review/11-launch-decision-pack.md:
1. Executive verdict: GO / GO-WITH-CONDITIONS / NO-GO for unrestricted commercial marketing, with the 3 strongest reasons.
2. Fixed-and-verified table: each critical/high finding from reviews 02/04/05/06 → closing task → verification evidence (test name, gate check #, or manual proof).
3. Accepted risks register: anything deliberately deferred (with D-decision references), each with trigger conditions for revisiting.
4. Capacity statement: safe concurrent users from the load test; cost per active user per month (voice from review 04 cost model post-W3.2 enforcement + LLM from W5.3 economics); gross-margin sanity check vs current pricing.
5. The 5 operational rituals: final gate before pushes, Sentry triage, Stripe dashboard weekly, eval:exam-flow in CI, graph economics quarterly.
Also write the Obsidian session-log note per CLAUDE.md's protocol (type: session-log) summarizing the full remediation program completion state.
```

**Success criteria:** Pack exists, every claim traceable to evidence; Obsidian note written; Piotr can make the marketing-push call from this document alone.

---

# PHASE 8 — Mobile Apps (iOS + Android)

> Read order: `docs/reviews/2026-06-09-comprehensive-review/07-mobile-readiness.md` in full. M1 and M2 can start as soon as W2.1 is merged; M3+ after Phase 7.

### Task M1: Mobile API enablement (bearer auth + voice params + contract doc)

**Agent:** Opus 4.8 · **Files:** `src/lib/supabase/server.ts`, `src/middleware.ts`, `src/app/api/stt/token/route.ts`, create `docs/mobile/API-CONTRACT.md`, tests

**Goal:** Make the existing backend consumable by native clients (R07: cookie-only auth is the single blocker for ~90% of routes) without changing web behavior.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/07-mobile-readiness.md "API readiness table" in full. Depends on W2.1 (server-owned exam state — the mobile contract).

1. Bearer support in src/lib/supabase/server.ts createClient(): when the request carries Authorization: Bearer <jwt> (no Supabase auth cookies present), construct the server client with global headers { Authorization } and resolve the user via auth.getUser(jwt). Cookie path unchanged. All routes get this for free — verify by grepping for any route creating its own client differently.
2. Rate-limit identity (src/middleware.ts:28-49): derive the per-user identifier from the Bearer token too (decode the JWT sub claim — no verification needed for rate-limit keying; auth happens in routes), falling back to IP as today.
3. Session enforcement (src/lib/session-enforcement.ts:19-24 / exam route :340-343): getSession() is cookie-bound — when Bearer auth was used, hash the Bearer JWT's session_id claim instead. Same semantics, both transports.
4. STT token route: add ?encoding=linear16&sample_rate=16000 passthrough support for the prebuilt WS URL (validate against an allowlist: opus-webm default | linear16/16000 | linear16/48000) per the mobile PCM capture path.
5. CORS: mobile native fetch doesn't need CORS, but add an explicit note + test that the API does not rely on Origin checks that would break non-browser clients.
6. Write docs/mobile/API-CONTRACT.md: for each v1 mobile route (the table in review 07), the exact request/response shape AS OF the post-W2.1 engine — including the respond SSE event format, the advancement payload, X-Task-Data headers, error/429 shapes from W3.2, and auth header requirements. This document is the spec the RN client builds against — be exhaustive; pull shapes from the route code, not from memory.
7. Tests: route test hitting /api/user/tier and /api/session with a Bearer token (supabase-js signInWithPassword in test to mint a real JWT against local/staging) asserting parity with cookie auth.
```

**Success criteria:** Same JWT works via cookie and Bearer with identical responses on 5 spot-checked routes; STT URL honors encoding params; API-CONTRACT.md covers every v1 route with verified shapes; web e2e suite unaffected.

---

### Task M2: iOS/Android functional & technical specification

**Agent:** Fable 5.0 · **Files:** Create `docs/mobile/MOBILE-SPEC.md` (+ `docs/mobile/screens/` wireframe descriptions)

**Goal:** The deliverable Piotr asked for: a complete, immediately-buildable functional and technical spec for the mirror iOS and Android apps, to App Store / Play Store standards.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/reviews/2026-06-09-comprehensive-review/07-mobile-readiness.md FULLY, docs/mobile/API-CONTRACT.md (from M1), and skim src/app/(dashboard)/practice/page.tsx + the voice hooks to ground the interaction spec in real behavior. Owner decision D5 (RESOLVED, delegated to AI analysis): React Native + Expo + RevenueCat; spike M3 validates the voice pipeline with hard thresholds, Flutter is the contingency only if the spike fails on both physical devices.

Write docs/mobile/MOBILE-SPEC.md — the complete functional + technical specification:

FUNCTIONAL (per screen, v1 scope from review 07's inventory):
1. Screen-by-screen spec: Login/OTP/OAuth (native Apple Sign-In required), Onboarding wizard, Practice (the core: chat + voice exam with SSE streaming, barge-in, resume, results), Home, Progress (incl. treemap equivalent), Settings (incl. mandatory account deletion), Paywall. For each: purpose, states (loading/empty/error/offline), user flows, API calls (reference API-CONTRACT.md sections), acceptance criteria. Describe layouts in text + ASCII wireframes in docs/mobile/screens/ (one file per screen).
2. Voice interaction spec: mic permission flow, push-to-talk vs auto-VAD decision (match web's current behavior; document the Flux upgrade path from W4.3), reconnect UX, examiner audio playback incl. background-audio completion, interruption handling (calls, notifications, route changes — CarPlay/Bluetooth at least noted).
3. Offline/degraded behavior: exams require connectivity (state it); what is cached (last sessions, progress snapshots); error taxonomy → user messaging.
4. v2 backlog: instructor screens, referral deep links, guest mode (from review 07 defer list).

TECHNICAL:
5. Architecture: RN+Expo (dev-client, New Architecture), navigation (expo-router), state (zustand or RQ — choose and justify), supabase-js with SecureStore session persistence, deep-link scheme com.heydpe:// registered in Supabase redirect URLs.
6. Voice pipeline design: native mic capture → linear16 PCM 16kHz → Deepgram WS (token from /api/stt/token?encoding=linear16&sample_rate=16000); TTS via /api/tts mp3 → expo-audio with streaming-start playback; port plan for sentence-boundary.ts and the useSentenceTTS queue/drain logic (pure TS — vendor as a shared package); the AudioSink abstraction per review 04's design caution. Name the candidate modules (@siteed/expo-audio-stream or custom config-plugin) and the spike acceptance criteria (see M3).
7. Payments: RevenueCat (iOS IAP mandatory per 3.1.1; Android per current Play US policy — link-out option documented with its legal flux caveat); product catalog mirroring Stripe prices; server entitlement merge design: RevenueCat webhook → new /api/iap/webhook → writes user_profiles tier with a source field, precedence rules vs Stripe (a user must never hold both — block IAP purchase when stripe_subscription_id active, and vice versa, with support escalation path).
8. Store compliance checklist: Sign in with Apple (native), account deletion in-app (exists server-side via W6.3), privacy manifest + required-reason APIs, Play Data Safety, mic purpose strings, background-audio entitlement, content rating, export-compliance (HTTPS only), screenshot/metadata plan.
9. Telemetry: PostHog RN SDK, event parity table with web (from W6.4), Sentry RN.
10. Delivery plan: milestone breakdown to TestFlight/internal-track beta (M: project scaffold+auth, M2: exam loop text-only, M3: voice, M4: payments+paywall, M5: progress/settings, M6: store submission), each with exit criteria; CI via EAS Build; versioning/OTA-update policy (expo-updates for JS-only fixes).
Every claim about the backend must cite API-CONTRACT.md or a file:line. Where the web app's behavior is the spec, cite the component. No placeholders — this document must be buildable-from without re-asking questions.
```

**Success criteria:** Spec covers all 7 v1 screens with acceptance criteria, the full voice pipeline design, the IAP/Stripe entitlement merge, and the store-compliance checklist; an engineer (or agent) could scaffold milestone 1 from it without clarifying questions; reviewed and accepted by Piotr.

---

### Task M3: React Native voice spike (go/no-go for D5)

**Agent:** Fable 5.0 · **Files:** New repo/dir `mobile-spike/` (throwaway), spike report

**Goal:** De-risk the one genuinely uncertain mobile bet (R07 framework caveat): prove RN+Expo can do live PCM mic → Deepgram WS → live transcript and mp3 TTS playback at acceptable latency on real devices, before committing the build.

**Prompt:**
```
Read docs/reviews/2026-06-09-comprehensive-review/07-mobile-readiness.md "Framework recommendation" item 3 and docs/mobile/MOBILE-SPEC.md §6. Build a THROWAWAY Expo dev-client app (separate dir mobile-spike/, not in the main repo's build) proving on one physical iPhone and one physical Android device:
1. Mic capture streaming linear16 PCM 16kHz to Deepgram WS (token minted from the real /api/stt/token with the M1 encoding params; bearer-auth with a test account) — live interim transcripts rendering; measure capture→first-interim latency.
2. /api/tts mp3 fetched and played via expo-audio with time-to-first-audio measured; play 3 chunks back-to-back gap-free (the prefetch pattern from useVoiceProvider).
3. Echo handling sanity: TTS playing through speaker while mic open — note whether OS echo cancellation (voiceProcessing/AcousticEchoCanceler via the chosen module) keeps the examiner's own voice out of the transcript.
4. Background: lock the screen mid-TTS — audio completes with the background-audio entitlement.
Acceptance thresholds: capture→interim < 800ms; TTS TTFA < 1.5s on Wi-Fi; echo not transcribed in a quiet room; if a custom native module/config-plugin was needed, document exactly what.
Report docs/mobile/SPIKE-REPORT.md: pass/fail per threshold per device, module choices, code snippets worth keeping, and a GO (RN confirmed) / NO-GO (escalate to Flutter comparison) recommendation for D5.
```

**Success criteria:** All four demos run on both physical devices; thresholds measured and reported; unambiguous D5 recommendation delivered.

---

### Task M4: IAP entitlement backend (requires D5 GO)

**Agent:** Fable 5.0 · **Files:** New `/api/iap/webhook`, migration (entitlement source), `tier-lookup.ts` precedence, tests

**Goal:** The server-side half of mobile payments per MOBILE-SPEC §7: RevenueCat events grant/revoke tiers idempotently and coexist safely with Stripe — including for the two existing Stripe payers if they install the app.

**Prompt:**
```
Repo: aviation-oral-exam-companion. Read docs/mobile/MOBILE-SPEC.md §7 and docs/reviews/2026-06-09-comprehensive-review/05-stripe-commercialization.md (the webhook patterns + migration safety culture — same care applies here).

1. Migration: user_profiles columns entitlement_source text CHECK (IN ('stripe','iap','override','none')) default 'none' (backfill: 'stripe' where stripe_subscription_id IS NOT NULL), iap_customer_id text, iap_event_log table mirroring subscription_events (idempotent by event id, RLS service-only).
2. POST /api/iap/webhook: RevenueCat webhook with Authorization header verification (shared secret env); handle INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE; map product identifiers → tier via one function (mirror W3.1's mapStripePriceToTier discipline); idempotent via iap_event_log; out-of-order guard on event timestamp (learn from R05 finding 5 — compare event-time, not processing-time, from day one).
3. Precedence in getUserTier/tier-lookup: entitlement_source-aware — stripe and iap never stack; an active Stripe sub blocks IAP grant application (log + alert for manual reconciliation) and vice versa; overrides (W3.3) still max() on top. invalidateTierCache on every write.
4. Purchase-blocking support: GET /api/iap/eligibility returning {eligible:boolean, reason} for the app to call before showing the IAP paywall (blocks when active Stripe sub exists — the app then deep-links to the Stripe portal instead).
5. Tests: full fixture suite per event type, ordering, idempotency, cross-provider blocking; explicit test: a user shaped like the two production payers (stripe sub active) receives an IAP INITIAL_PURCHASE → tier unchanged + alert logged.
PR checklist: RevenueCat project setup steps for the owner (apps, products, webhook URL + secret).
```

**Success criteria:** Fixture suite green incl. cross-provider blocking; replay of any event is a no-op; production payers provably unaffected by any IAP event; owner setup checklist delivered.

---

# Sequencing summary

```
W0.1 → W0.2 → W0.3                          (Phase 0, ~sequential, fast)
  └→ W1.1 → W1.2 → W1.3 → W1.4              (Phase 1, sequential — W1.1 before W2.5's RPC edit)
       └→ W2.1 → W2.2 → W2.3 → W2.4 → W2.5 → W2.6   (Phase 2, strictly sequential)
            ├→ W3.1 → W3.2 → W3.3 → W3.4              (Phase 3, after W2.1; D1/D3 resolved)
            ├→ W4.1 → W4.2 → W4.3                     (Phase 4, parallel with 3/5; D2 = Aura-2)
            ├→ W5.1 → W5.2 → W5.3 → W5.4 → W5.5 ⊣Gate1 → W5.6 ⊣Gate2  (Phase 5: drop graph, build+prove Scenario Engine)
            └→ M1 → M2 ──────────────────────┐       (Phase 8 head start after W2.1; D5 = RN+Expo)
W6.1 W6.2 W6.3 W6.4 W6.5                     │       (Phase 6, after 3-5, parallelizable)
  └→ W7.1 → W7.2  ═══ WEB LAUNCH GATE ═══    │
                 └→ M3 → M4 ─────────────────┴→ mobile build per MOBILE-SPEC milestones
```

Notes: W5.5/W5.6 are proof gates — the Scenario Engine flag stays off until each passes; neither blocks the web launch gate (exams run linear, as today, until the engine proves itself). Estimated agent-task count: 33 web + 4 mobile-enablement. The mobile app build itself (post-M4) proceeds per MOBILE-SPEC.md §10 milestones as its own plan.

## Plan self-review notes

- Every task prompt names its exact files, cites review evidence with file:line, and carries explicit success criteria — verified against the "No Placeholders" rule. All five owner decisions (D1–D5) are resolved as of 2026-06-09 and inlined into the affected prompts; no open placeholders remain.
- Spec coverage check against the owner's ask: graph dropped and replaced by a proven non-linear mechanism (W5.1 removal; W5.3–W5.6 Scenario Engine build + two binding proof gates per `2026-06-09-scenario-engine-design.md`), voice = Aura-2 on the economics analysis (review 12 + W4.2), grading/progress bugs (W2.1–W2.6, 20 confirmed bugs mapped), Stripe/commercialization incl. Stripe Tax without breaking the two payers (W3.1–W3.4 with explicit sequencing), web launchable (W7.1 gate), iOS/Android spec for immediate development (M1–M4 + MOBILE-SPEC.md). No gaps found.
- Type-consistency check: task cross-references (W1.1↔W2.5 shared RPCs, W2.1→M1 contract dependency, W3.1's mapStripePriceToTier pattern reused in M4) are called out inside the affected prompts so agents coordinate instead of clobbering.
