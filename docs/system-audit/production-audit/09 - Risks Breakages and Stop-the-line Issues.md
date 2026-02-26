---
date: 2026-02-24
type: system-audit
tags: [aviation-oral-exam, production-audit, risks, breakages, stop-the-line]
status: completed
audit-scope: risk-analysis
severity: critical
---

# 09 — Risks, Breakages, and Stop-the-Line Issues

---

## 1. Stop-the-Line Issues

These are production defects that are actively degrading user experience or data integrity. They should be addressed before new feature work.

---

### 1.1 page_start = 0 for ALL Chunks — Citations Broken

> [!risk] SEVERITY: HIGH — Data Integrity
> Every chunk in the production `concepts` / chunk storage has `page_start = 0`. This means any citation or reference that attempts to point the student to a specific page in an FAA publication (ACS, PHAK, AFH, FAR/AIM) will display "page 0" or an empty reference.

**Impact:**
- Students cannot verify examiner claims against source material
- Undermines the credibility of the "check your sources" safety instruction
- Any future "show source" UI feature will display meaningless page references

**Root cause (likely):** The extraction pipeline either did not extract page metadata from source PDFs, or extracted it but failed to write it during the chunk insertion step. Since ALL values are 0 (not some), this points to a systematic issue in the extraction script rather than a partial failure.

**Fix path:**
1. Identify the extraction script that populated chunks (likely in `scripts/extract-images/`)
2. Verify that source PDFs contain extractable page metadata
3. Re-run extraction with page tracking enabled
4. Update existing rows via batch `UPDATE` keyed on chunk content hash or source file reference

---

### 1.2 embedding_cache Hits = 0 — Cache Broken or Unused

> [!risk] SEVERITY: MEDIUM — Performance / Cost
> The embedding cache shows zero hits in production. This means either (a) cache writes are failing silently, (b) cache keys are never matching, or (c) the cache is not being consulted.

**Impact:**
- Every RAG query pays full embedding API cost (no reuse)
- Repeated questions within the same session generate redundant embedding calls
- Latency is higher than necessary for common query patterns

**Possible causes:**
- Cache write errors swallowed by a `try/catch` with no logging
- Cache key includes a timestamp or session-specific value that prevents matches
- Cache TTL is too short (entries expire before reuse)
- Cache storage backend (in-memory? Redis? Supabase?) is not persisting correctly

**Fix path:**
1. Add explicit logging to cache write and cache read paths
2. Inspect cache key composition — ensure it is deterministic for identical input text
3. Verify the cache storage backend is functional in the Vercel serverless environment (in-memory caches do not persist across invocations)

> [!note] Serverless Cache Warning
> If the embedding cache is in-memory (e.g., a module-level `Map`), it will be empty on every cold start. Vercel serverless functions do not guarantee instance reuse. A durable cache (Supabase table, Vercel KV, or Upstash Redis) is required for meaningful hit rates.

---

### 1.3 21 Active Sessions Never Closed

> [!risk] SEVERITY: MEDIUM — Data Integrity
> 21 out of 70 total sessions remain in `active` status and were never transitioned to `completed` or `abandoned`. Combined with the 27 explicitly abandoned sessions, this represents a 39% abandonment rate (21 leaked + 27 abandoned = 48 of 70 sessions did not complete normally, though some of the 21 may be legitimately in-progress — unlikely given the audit timeframe).

**Impact:**
- Progress statistics are skewed — incomplete sessions may be counted in coverage metrics
- `get_uncovered_acs_tasks()` may include stale session data
- No way to distinguish "user closed browser tab" from "session crashed"

**Root cause (likely):** The client-side session update (`POST /api/session` with `status: 'completed'`) depends on the user explicitly ending the exam. If the user navigates away, closes the tab, or the browser crashes, the session is never closed.

**Fix path:**
1. Implement a `beforeunload` handler that fires a `navigator.sendBeacon()` to mark the session as abandoned
2. Add a server-side cleanup job (cron or Supabase scheduled function) that marks sessions older than N hours as `abandoned`
3. Add a `last_activity_at` column to enable timeout-based cleanup

---

### 1.4 No rag.metadata_filter Flag in Production

> [!risk] SEVERITY: MEDIUM — Retrieval Quality
> The `rag.metadata_filter` system config flag does not exist in production. This means metadata-based filtering (by rating, ACS area, document source) is disabled for all RAG queries.

**Impact:**
- RAG queries return chunks from all ratings indiscriminately — a Private Pilot session may retrieve Commercial-only regulatory content
- Retrieval noise is higher than necessary
- The 32 unit tests for `rag-filters.ts` pass in test but the feature they test is inactive in production

**Fix path:**
1. Insert the flag: `INSERT INTO system_config (key, value) VALUES ('rag.metadata_filter', 'true')`
2. Verify in staging that metadata filtering does not reduce recall below acceptable levels
3. Monitor retrieval quality after enabling

---

## 2. Schema and Infrastructure Risks

---

### 2.1 PostgREST Schema Cache Staleness

> [!risk] SEVERITY: LOW-MEDIUM — Operational
> PostgREST caches the database schema (tables, RPCs, types) and does not automatically detect new migrations. After applying a migration that adds or modifies an RPC function, the new function may not be accessible via the REST API until the schema cache is refreshed.

**Observed:** Schema introspection queries against `information_schema` all failed — this is expected behavior (Supabase does not expose `information_schema` via PostgREST), but confirms that external schema validation tools cannot verify the production schema remotely.

**Fix procedure (execute in staging first):**

```sql
-- Option 1: Notify PostgREST to reload (preferred)
NOTIFY pgrst, 'reload schema';

-- Option 2: Restart PostgREST via Supabase dashboard
-- Settings > API > Restart API Server

-- Option 3: If using Supabase CLI
-- supabase db reset (DESTRUCTIVE — staging only)
```

> [!note] Migration Checklist Addition
> Every migration that adds or modifies an RPC should include a `NOTIFY pgrst, 'reload schema'` at the end of the migration file, or the deployment checklist should include a manual schema reload step.

---

### 2.2 JSONB Column Schema Drift Risk

The `exam_sessions` table uses multiple JSONB columns:
- `metadata`
- `result`
- `acs_tasks_covered`

Similarly, `session_transcripts.assessment` is unstructured JSONB.

**Risk:** There are no database-level constraints (`CHECK` constraints or JSON Schema validation) on these columns. Application code can write any JSON structure, and schema changes to the expected format will not be caught by the database.

**Mitigation:**
- Add `CHECK` constraints for critical fields (e.g., `CHECK(acs_tasks_covered IS NULL OR jsonb_typeof(acs_tasks_covered) = 'array')`)
- Document the expected JSONB schema in a migration comment or a `_schema` table

---

## 3. Security and Safety Model

---

### 3.1 Safety Prefix — Correctly Hardcoded

The `IMMUTABLE_SAFETY_PREFIX` in `src/lib/prompts.ts:1-6` is hardcoded and cannot be overridden by database content. This is the correct design for a safety-critical application. The prefix:

- Declares the AI is for educational practice only
- Prohibits flight instruction, endorsements, or medical advice
- Redirects authority questions to FAA publications and CFIs
- Explicitly forbids encouraging unsafe operations

> [!note] Verified: Safety Prefix is Robust
> The safety prefix is prepended at the code level before any database-sourced prompt content. An admin with database access cannot remove it — only a code deployment can modify it. This is the appropriate trust boundary.

---

### 3.2 requireSafeDbTarget Guard

The `requireSafeDbTarget()` function checks the `app.environment` marker in the database to prevent staging code from writing to production. This guards against:

- Misconfigured environment variables pointing staging code at the production database
- Copy-paste errors in connection strings
- CI/CD pipeline misrouting

**Limitation:** This guard depends on the `app.environment` value being correctly set in each database. If both staging and production have the same marker value (or the marker is missing), the guard is ineffective.

---

### 3.3 RLS and Admin Guard

| Protection Layer | Scope |
|-----------------|-------|
| Row-Level Security (RLS) | All 8 tables have RLS policies |
| `admin_users` table | Admin operations require membership |
| Service role key | Server-side only — never exposed to client |
| Supabase Auth | Email/password with email confirmation required |
| Middleware route protection | `/practice`, `/progress`, `/settings` require auth |
| Auth redirect | Logged-in users redirected away from `/login`, `/signup` |

> [!note] Security Model Assessment
> The security model is appropriate for the application's threat profile. The primary risks are (1) service role key leakage (would bypass all RLS) and (2) admin_users table manipulation (if service role key is compromised). Both are standard Supabase security considerations.

---

## 4. Operational Risks

---

### 4.1 Session Abandonment Rate: 39%

| Session Status | Count | Percentage |
|----------------|-------|------------|
| Completed | 22 | 31% |
| Abandoned (explicit) | 27 | 39% |
| Active (never closed) | 21 | 30% |
| **Total** | **70** | **100%** |

> [!risk] Abandonment Signal
> A 39% explicit abandonment rate (plus 30% leaked-active) suggests either (a) the exam experience has friction points causing users to leave, (b) users are testing/exploring rather than completing full sessions, or (c) the session-end flow is not discoverable. This warrants UX investigation.

---

### 4.2 Monolithic practice/page.tsx

> [!risk] SEVERITY: MEDIUM — Maintainability
> The `src/app/(dashboard)/practice/page.tsx` file is the main exam interface and likely exceeds 1,000 lines. It handles:
> - Chat UI rendering
> - Voice input/output
> - Session state management
> - ACS task display
> - Exam flow control (start, respond, next-task)
> - TTS playback
> - STT recording
>
> Monolithic page components are difficult to test, review, and modify without regression risk.

**Recommended decomposition:**
- Extract voice controls into `components/voice-controls.tsx`
- Extract chat display into `components/chat-thread.tsx`
- Extract session management into a custom hook `hooks/useExamSession.ts`
- Extract TTS/STT into `hooks/useVoicePipeline.ts`

---

### 4.3 No Error Tracking Service

> [!risk] SEVERITY: HIGH — Operational Visibility
> There is no Sentry, LogRocket, Datadog, or equivalent error tracking service configured. Errors are logged to `console.error` only, which means:
> - Client-side errors in production are invisible unless a user reports them
> - Server-side errors in API routes are only visible in Vercel function logs (ephemeral, no alerting)
> - No error rate monitoring or alerting
> - No ability to correlate errors with specific users or sessions

**Recommendation:** Integrate Sentry (free tier supports 5K events/month) with Next.js. The `@sentry/nextjs` package provides automatic error boundary wrapping, API route error capture, and source map upload.

---

## 5. What Prevents Running a Real Exam E2E

An end-to-end exam session requires all of the following to be functional:

| Component | Status | Blocking? |
|-----------|--------|-----------|
| Supabase Auth (login) | Working | No |
| Session creation (`POST /api/session`) | Working | No |
| ACS task loading (`acs_tasks` table) | Working (143 tasks across 3 ratings) | No |
| Exam start (`POST /api/exam` action=start) | Working | No |
| Claude API (examiner generation) | Working | No |
| Claude API (answer assessment) | Working | No |
| RAG retrieval (hybrid_search) | Working (but metadata filter disabled) | No (degraded) |
| Graph retrieval (get_concept_bundle) | Working | No |
| TTS (text-to-speech) | Working (multi-provider) | No |
| STT (speech-to-text) | Working (Chrome only) | No (browser-limited) |
| Session completion | Working (if user clicks end) | No |
| Session cleanup | **Not working** (leaked sessions) | No (data quality) |
| Chunk citations | **Broken** (page_start = 0) | No (cosmetic) |
| Embedding cache | **Not working** (0 hits) | No (performance) |
| Metadata filtering | **Disabled** (no flag) | No (retrieval quality) |

> [!note] E2E Verdict
> Nothing prevents a user from completing a full exam session. The broken components (citations, cache, metadata filter, session cleanup) degrade quality and efficiency but do not block the core flow. The application is functional for its primary use case.

---

## 6. PostgREST Schema Cache — Fix Procedure

This procedure should be executed whenever a migration adds or modifies RPC functions, custom types, or table structures that are accessed via the Supabase REST API.

### Step 1: Apply in Staging First

```sql
-- Connect to staging database
-- Verify the migration has been applied
SELECT proname, proargtypes
FROM pg_proc
WHERE proname = 'get_concept_bundle';

-- If the RPC exists in pg_proc but is not accessible via REST:
NOTIFY pgrst, 'reload schema';

-- Verify via REST API
-- curl https://<staging-ref>.supabase.co/rest/v1/rpc/get_concept_bundle \
--   -H "apikey: <anon-key>" \
--   -H "Content-Type: application/json" \
--   -d '{"p_element_code": "PA.I.A.K1"}'
```

### Step 2: Validate in Staging

- Confirm the RPC returns expected results via REST
- Run the application against staging and verify the feature that depends on the RPC
- Check Supabase logs for any PostgREST errors

### Step 3: Apply in Production

```sql
-- Connect to production database
NOTIFY pgrst, 'reload schema';
```

### Step 4: Verify in Production

- Confirm via REST API call
- Monitor application logs for the next 15 minutes
- Verify no increase in error rates

> [!todo] Add to Migration Checklist
> Every migration file that creates or alters an RPC should end with:
> ```sql
> -- Reload PostgREST schema cache
> NOTIFY pgrst, 'reload schema';
> ```
> This ensures the cache is refreshed as part of the migration itself, removing the manual step.

---

## 7. Risk Registry Summary

| ID | Risk | Severity | Status | Fix Effort |
|----|------|----------|--------|------------|
| R-01 | `page_start = 0` for all chunks | HIGH | **Active defect** | 4-8 hours (re-extraction) |
| R-02 | Embedding cache 0 hits | MEDIUM | **Active defect** | 2-4 hours (diagnosis + fix) |
| R-03 | 21 sessions never closed | MEDIUM | **Active defect** | 2-3 hours (beacon + cron) |
| R-04 | No `rag.metadata_filter` flag | MEDIUM | **Active defect** | 30 min (flag insert + verify) |
| R-05 | No error tracking service | HIGH | **Gap** | 2-4 hours (Sentry integration) |
| R-06 | Monolithic practice/page.tsx | MEDIUM | **Tech debt** | 1-2 days (decomposition) |
| R-07 | PostgREST schema cache staleness | LOW-MEDIUM | **Operational risk** | 15 min per occurrence |
| R-08 | JSONB schema drift | LOW | **Structural risk** | 1-2 hours (add constraints) |
| R-09 | 39% session abandonment | MEDIUM | **UX signal** | Investigation needed |
| R-10 | Shadow mode flag redundancy | LOW | **Cleanup** | 15 min |

### Recommended Fix Order

1. **R-04** — Enable metadata filter (30 min, immediate retrieval quality improvement)
2. **R-05** — Add Sentry (2-4 hours, unlocks visibility into all other issues)
3. **R-02** — Fix embedding cache (2-4 hours, cost and latency reduction)
4. **R-03** — Session cleanup (2-3 hours, data integrity)
5. **R-01** — Re-extract page metadata (4-8 hours, citation accuracy)
6. **R-06** — Decompose practice/page.tsx (1-2 days, maintainability)
7. **R-07** — Add NOTIFY to migration checklist (15 min, prevent future issues)
8. **R-08** — Add JSONB constraints (1-2 hours, schema safety)
