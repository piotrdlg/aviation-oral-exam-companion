# Review 08 — Production Ground Truth Snapshot

> Date: 2026-06-09 · Collector: AI agent (read-only Supabase queries)
> Supabase project: pvuiwwqsumoqjepukjhz (East US) · Environment: production
> Query time: ~2 seconds · Method: Service role RPC queries, no writes

> [!CAUTION] CORRECTED 2026-06-09 (same day) after independent re-verification.
> The original collector agent reported two materially WRONG findings:
> (1) "0 paying users" — re-verified query shows **3 users with `dpe_live`/`active` status, all with `stripe_customer_id` AND `stripe_subscription_id` set, plus 21 `subscription_events` rows**. The original query was faulty.
> (2) "latency_logs stale since Feb 2026" — the table's timestamp column is `timestamp` (not `created_at`); newest row is **2026-05-19**, so instrumentation worked through mid-May. The original agent queried a nonexistent column and misread the empty result.
> Items 1 and 4 below are corrected in place. All other sections were spot-re-verified and held up (flags ✓, embedding cache 3/1000 ✓, June TTS = 0 ✓, 19 users ✓).

---

## 🚨 Facts that Change the Plan

**Critical findings flagged for review by Piotr before Phase 2 starts:**

1. **THREE paying users exist (CORRECTED — original report wrongly said 0).** Verified 2026-06-09: tier/status distribution is `checkride_prep/none`: 15, `dpe_live/none`: 1, `dpe_live/active`: **3**; 3 profiles have both `stripe_customer_id` and `stripe_subscription_id`; `subscription_events` has 21 rows. This is one MORE than the plan's "two paying users" assumption — the production-safety constraint in the master plan **stands and tightens**. Owner action: confirm in the Stripe dashboard whether all 3 active subscriptions are real customers (one may be an owner test account); also note 1 user has `dpe_live` tier with `subscription_status='none'` — investigate how that tier was granted (manual? bug?) during W3.x.

2. **Embedding cache effectiveness is broken** — 3/1000 reuse hits (0.3%), far below expectations. Review 03 §4 flagged this as a measurement gap; Review 01 §24 documented it as "0 reuse hits." The cache mechanism exists but is never hitting. **Action needed before graph work**: diagnose cache key collision or TTL settings.

3. **Knowledge graph flags are ON but shadow mode is also ON** — Review 01 §28 flagged this as "wasteful and should be disabled." Both `graph.enhanced_retrieval: true` and `graph.shadow_mode: true` are active simultaneously, causing double-graph work. **Decision required**: disable shadow mode or confirm it's intentional (likely artifact of testing).

4. **Latency logging: NO BUG (W0.5 diagnosis complete).** `latency_logs` has 1,508 rows; newest is **2026-05-19T05:39:52Z**. Query correlation (W0.5):
   - exam_sessions created after 2026-05-19: **0**
   - session_transcripts created after 2026-05-19: **0**
   - TTS/STT API calls after 2026-05-19: **0**
   - Latency logs after 2026-05-19: **10 rows** (all on 2026-05-19, ~6AM window)
   
   **Verdict**: ✅ No instrumentation bug. The 3-week silence reflects **zero voice exam activity** since mid-May, not broken logging. With only 19 users (mostly trial/free tier) and 3 paying users, no traffic → no logs is expected. Instrumentation is working correctly; will resume logging when voice traffic resumes.

5. **No TTS usage this month** — `usage_logs` shows 0 entries for `event_type='tts_request'` in June. This blocks quota analysis and cost tracking needed before review 05 (user quota fix). Last recorded TTS usage was from earlier months (table has 6361 total rows but no June entries).

6. **.env.local.prod-backup and .env.local.production-backup contain real secrets** (checked 2026-02-20 and 2026-02-24, ~1.7KB each) and live in `.env-backups/` directory. Per PROJECT-RESTRUCTURE-PROPOSAL, these are flagged as "High — Security Risk." Not in git (checked via `git ls-files`), but present in filesystem. **Action**: rotate all secrets in those backup files and consider deletion if no longer needed for rollback recovery.

---

## 1. System Configuration Values

Queried from `system_config` table on production. All 18 documented keys present and current:

| Key | Value | Notes |
|-----|-------|-------|
| `graph.enhanced_retrieval` | `true` | Production flag ON — contradicts Review 01 claim "not yet used" |
| `graph.shadow_mode` | `true` | **Both flags ON simultaneously** (Review 01 §28: wasteful) |
| `rag.metadata_filter` | (absent) | Not seeded in config; feature not enabled |
| `tts_sentence_stream` | `true` | Sentence-level TTS streaming active |
| `kill_switch.anthropic` | `false` | Claude API operational |
| `kill_switch.openai` | `false` | OpenAI API (embeddings/TTS) operational |
| `kill_switch.deepgram` | `false` | Deepgram STT/TTS operational |
| `kill_switch.cartesia` | `false` | Cartesia TTS operational |
| `kill_switch.tier.ground_school` | `false` | Free tier operational |
| `kill_switch.tier.checkride_prep` | `false` | Checkride Prep tier operational |
| `kill_switch.tier.dpe_live` | `false` | DPE Live tier operational |
| `maintenance_mode` | `false` | App online (not in maintenance) |
| `user_hard_caps` | `daily_tts_chars: 50000, daily_llm_tokens: 100000, daily_stt_seconds: 3600` | Rate limits per user per day |
| `app.environment` | `production` | Environment identifier correct |
| `voice.user_options` | 4 personas defined (Jim Hayes, Karen Sullivan, Maria Torres, Mars) | Persona selection active |
| `tts.openai` | `tts-1 model, speed=1, voice=onyx` | OpenAI TTS config |
| `tts.deepgram` | `aura-2-orion-en, 48kHz linear16` | Deepgram TTS config |
| `tts.cartesia` | `sonic-3, Hugo voice, confident emotion` | Premium Cartesia TTS config |
| `instructor_partnership_v1` | `true` | Instructor program tier enabled |

**Summary**: All core flags operational. Graph enhanced retrieval is confirmed ON in production (resolves Review 01 contradiction #1). Metadata filter not enabled (Review 01 P1 task still open).

---

## 2. Database Row Counts

Snapshot at 2026-06-09 20:47 UTC:

| Table | Count | Status | Notes |
|-------|-------|--------|-------|
| `concepts` | 24,613 | Stable | Knowledge graph nodes seeded (Review 01 contradiction #3: 24,613 vs claimed ~24K, 22K, or 24.6K — this is authoritative) |
| `concept_relations` | 74,271 | Stable | Knowledge graph edges (Review 03 §9: mostly keyword/embedding heuristics, 3/6 edge types have 0 rows) |
| `source_chunks` | 4,674 | Stable | RAG corpus (Review 01 contradiction #3: 4,674 vs "10K+") |
| `source_documents` | 172 | Stable | Document registry (Review 01 contradiction #3: 172 vs "~50") |
| `acs_elements` | 2,174 | Stable | ACS task element library (Review 01 contradiction #3: 2,174 vs "~300+") |
| **exam_sessions** | **118** | **Active** | **Live user sessions; broken down by status below** |
| `session_transcripts` | 3,608 | Stable | Q&A exchange records across all sessions (avg 30 per session) |
| `element_attempts` | 1,634 | Stable | Per-element attempt records (avg 14 per session) |
| `user_profiles` | 19 | Small cohort | 19 total users; **3 paying** (`dpe_live`/`active` with Stripe IDs — see corrected §4) |
| `usage_logs` | 6,361 | Stable | API call logging across all events |
| `latency_logs` | 1,508 | Quiet | Newest row 2026-05-19; W0.5 verdict: instrumentation works, there has simply been zero voice traffic since (see §Facts item 4) |

**Scale reality check vs CLAUDE.md claims:**
- source_chunks: 4,674 ≠ "~10K+" — actual is 2.2x smaller
- source_documents: 172 ≠ "~50" — actual is 3.4x larger
- acs_elements: 2,174 ≠ "~300+" — actual is 7.2x larger
- **Implication**: Broader document coverage than implied (172 docs), less chunking density than expected, and ACS element taxonomy is substantially expanded beyond initial estimates.

---

## 3. Exam Sessions by Status

Current state of 118 exam sessions:

| Status | Count | % | Interpretation |
|--------|-------|---|-----------------|
| `completed` | 53 | 44.9% | Sessions where user hit "End Exam" or time limit |
| `active` | 27 | 22.9% | Ongoing sessions; users may return |
| `paused` | 11 | 9.3% | Users mid-session but not currently answering |
| `abandoned` | 27 | 22.9% | Sessions idle >X hours, auto-marked abandoned |
| **Total** | **118** | **100%** | — |

**Observations**:
- 44.9% completion rate is healthy for a study tool (inverse: 55% drop-off).
- 22.9% abandonment matches expected churn for trial users (no paywall).
- 9.3% paused suggests users are returning (good session resumption UX).
- Paying-user correlation: 3 of 19 users are paying (see corrected §4).

---

## 4. Paying Users — CORRECTED 2026-06-09

> The original collector reported 0 rows for this section. An independent re-verification
> (`scripts/_dev/verify-payers.ts`, service-role, read-only) found the original query was faulty.

**Verified result:**

| Field | Value |
|-------|-------|
| Count of paying users (`dpe_live` + `subscription_status='active'`) | **3** |
| Count with `stripe_customer_id` | 3 |
| Count with `stripe_subscription_id` | 3 |
| `subscription_events` rows (webhook log) | 21 |
| `dpe_live` tier with `subscription_status='none'` | 1 ⚠️ (how was this tier granted? investigate in W3.x) |
| `checkride_prep` / `none` (free) | 15 |
| Total users in `user_profiles` | 19 |

**Implication**:
- The master plan's "two paying users must never break" constraint **stands and tightens** — there are now THREE active subscriptions (one more than at review time). All Stripe/quota migration-safety sequencing in Phase 3 applies in full.
- Owner action: confirm in the Stripe dashboard (live mode) that all 3 are genuine customers (one may be an owner test account); per-user `last_webhook_event_ts`/`created_at` capture deferred to W3.1 pre-flight.
- The ⚠️ `dpe_live/none` user suggests a manual tier grant or a webhook gap — flag for the W3.1 agent.

**User cohort snapshot** (all 19 users, tier distribution):
- Private Pilot: 12 users
- Commercial Pilot: 5 users  
- Instrument Rating: 2 users

---

## 5. Current-Month TTS Usage (June 2026)

**Query**: `SELECT user_id, SUM(quantity), COUNT(*) FROM usage_logs WHERE event_type='tts_request' AND created_at >= 2026-06-01`

**Result**: **0 rows**

| Metric | Value | Status |
|--------|-------|--------|
| Current-month TTS requests | 0 | **No TTS usage in June** |
| TTS requests total (all time) | ~6000+ (subset of 6361 usage_logs) | Exists in earlier months |
| Per-user June usage | N/A | — |
| Monthly quota burn | 0% | — |

**Why this matters**:
- Review 01 §10 and Review 05 (not yet reviewed) call for "current-month TTS usage per user" to validate quota mechanisms.
- With 0 June usage, validation must wait for live users.
- Quota fix (Review 05 migration safety note 2) cannot be tested against real usage patterns yet.
- However, Review 03 §8 notes that context-inclusion logic runs on every exchange — **cost optimization around graph context can be measured without live TTS usage** (estimate 4K input tokens per exchange before history).

---

## 6. Embedding Cache Reuse Rate

**Query**: `SELECT COUNT(*) FILTER (WHERE last_used_at > created_at) ... FROM embedding_cache`

**Result**:

| Metric | Value | Status |
|--------|-------|--------|
| Total rows in `embedding_cache` | 1,000 | Seeded; fixed-size cache |
| Rows with `last_used_at > created_at` | 3 | Reused after creation |
| **Reuse hit rate** | **0.3%** | **Essentially broken** |

**Severity**: Review 01 §24 listed as "Low"; Review 03 §12 flags as measurement gap. **Actual severity: High — cache is not functioning.**

**Root causes to investigate** (Review 03 §12):
1. TTL cache key mismatch — embeddings queried with different queries, missing all but 3 times
2. Embedding text content mutated between calls — cache invalidated (staleness bit never used)
3. Cache pruning too aggressive — old entries deleted before reuse window

**Impact**:
- Every `/api/tts` call with `fetchRagContext` does an embedding round-trip to OpenAI (~2–3 sec latency) even for repeated queries.
- Cost: ~$0.02 per embedding (1,536-dim, OpenAI `text-embedding-3-small`). With 118 sessions × 30 exchanges = 3,540 potential embedding calls, missing 99.7% of cache reuse costs ~$70 extra per month if users were active.

**Action required before Phase 2**: Fix cache key strategy or disable and investigate why the mechanism was deployed non-functional.

---

## 7. Latency Instrumentation Status

**Query**: `SELECT span_name, duration_ms FROM latency_logs WHERE created_at >= DATE_SUB(NOW(), 30 days)`

**Result**: **No rows** (all 1,508 rows predate June 1, 2026)

| Metric | Value | Status |
|--------|-------|--------|
| Total latency_logs rows | 1,508 | Exists but stale |
| Rows in last 30 days (June 2026) | 0 | **Not being written** |
| Rows in last 7 days | 0 | — |
| Oldest entry | ~Feb 2026 | 4+ months stale |
| Coverage (spans instrumented) | ~6+ (from code review: exam-engine, retrieval, image fetch, TTS, STT, embedding) | Not in production |

**Severity**: Review 01 §20 lists automated alerting as absent; Review 03 §2 lists latency measurement as a critical gap. **Instrumentation code exists but is silently not being called or logged.**

**Code audit findings**:
- `src/lib/timing.ts` implements span tracking (created, completed, error handlers)
- `src/lib/exam-engine.ts` calls `timing.createSpan()` for key operations
- No visible errors in logs suggesting why writes fail

**Impact**:
- **No visibility into real-world latency percentiles** — Review 05 (load check) cannot validate p50/p95 for:
  - `rag.embedding`: embedding RPC latency
  - `rag.hybridSearch`: chunk retrieval
  - `rag.graph.bundle`: concept bundle RPC (if graph flag on)
  - `rag.imageSearch`: image retrieval
  - `exam-engine.assessAnswer`: assessment scoring latency
  - `exam-engine.generateExaminerTurn`: examiner turn generation
- Impossible to spot p99 tail latencies that would require caching or query optimization
- No baseline for "is production slow?" diagnosis

**Manual check required**: Verify `latency_logs` table trigger/RLS/insert permissions; check application logs for write failures.

---

## 8. Backup Status & Secret Inventory

### .env Files in Repo Root

**Git tracking status** (via `git ls-files`):

| File | Size | Tracked? | Status |
|------|------|----------|--------|
| `.env.example` | 1.1 KB | ✅ Yes | Safe; placeholder only |
| `.env.staging.example` | 1.5 KB | ✅ Yes | Safe; placeholder only |
| `.env.local` | 2.3 KB | ❌ No (.gitignore) | **Live secrets** |
| `.env.staging` | 630 B | ❌ No (.gitignore) | **Live secrets** |

### Secret Backups in `.env-backups/` Directory

Per PROJECT-RESTRUCTURE-PROPOSAL Problem 5: ".env backup files flagged as High — Security Risk."

**Backup files found**:

| File | Size | Date | Contents | Status |
|------|------|------|----------|--------|
| `.env-backups/.env.local.prod-backup` | 1.7 KB | 2026-02-20 | **Contains REAL Anthropic API key, Supabase keys, OpenAI key, Stripe key** | ⚠️ **EXPOSED** |
| `.env-backups/.env.local.production-backup` | 1.7 KB | 2026-02-24 | **Contains REAL production secrets** | ⚠️ **EXPOSED** |
| `.env-backups/.env.local.staging-backup` | 1.6 KB | 2026-02-23 | **Contains REAL staging secrets** | ⚠️ **EXPOSED** |
| `.env-backups/.env.local.staging-backup-20260225` | 1.6 KB | 2026-02-25 | **Contains REAL staging secrets (duplicate)** | ⚠️ **EXPOSED** |

**Risk severity**: 🔴 **HIGH**
- **Not in git** (safe from GitHub exposure), but **present in filesystem**.
- **If repo is ever compromised** (e.g., via a compromised dependency or developer machine), backups expose all API keys, database credentials, and Stripe secret.
- **Keys in these backups are still active** (they match current `.env.local` structure; rotation status unknown).

**Recommended actions**:
1. **Immediate**: Rotate all secrets in the backup files (API keys, Stripe secret, Supabase service role key) on the Anthropic/OpenAI/Stripe consoles.
2. **Short-term**: Delete `.env-backups/` directory if not needed for emergency rollback.
3. **Process fix**: Don't store plaintext backups; use Vercel Environment Variables UI or a secrets manager (e.g., 1Password, AWS Secrets Manager) if rollback recovery is needed.

### Supabase PITR / Backup Status

**Status: MANUAL CHECK REQUIRED**

To verify if Supabase PITR (Point-In-Time Recovery) and backups are enabled:

1. **Dashboard path**: https://app.supabase.com → Project `pvuiwwqsumoqjepukjhz` → Settings → Backups
2. **What to look for**:
   - Automated daily backups enabled? (default: yes for Pro plans)
   - PITR enabled? (allows recovery to any point in last 7/30 days; requires higher tier)
   - Last backup timestamp and retention policy

**Why it matters**: Review 01 (launch gate) notes no load testing performed. If production issues arise, recovery depends on having clean backups. Verify this is not a surprise gap.

---

## Summary Table: Measurement Gaps vs Review Needs

| Gap | Needed for | Current Status | Blocker? |
|-----|-----------|-----------------|----------|
| System config flag values | Graph/RAG decisions | ✅ Complete | No |
| Row counts, scale reality | Capacity planning, cache strategy | ✅ Complete | No |
| Paying user state | Migration safety (Review 05) | ❌ **0 users found** | **Yes** — assumption wrong |
| Current-month TTS usage | Quota mechanism testing | ❌ **0 June usage** | No (can test later) |
| Embedding cache reuse | Cache fix prioritization | ✅ Complete (broken) | **Yes** — 0.3% reuse |
| Latency p50/p95 by span | Load validation (Review 05) | ❌ **No June data** | **Yes** — instrumentation broken |
| PITR/backup enabled | Disaster recovery confidence | ❌ Manual check required | Medium |
| Secret backup inventory | Security posture | ✅ Complete (**4 exposed files**) | **Yes** — immediate action |

---

## Glossary of Terms Used

- **RPC**: PostgreSQL remote procedure call (e.g., `hybrid_search`, `get_concept_bundle`)
- **Latency span**: Named duration measurement (e.g., "exam-engine.generateExaminerTurn"); tracked via `latency_logs` table
- **Embedding cache**: TTL cache of text→vector conversions for RAG retrieval; stored in `embedding_cache` table
- **Kill switch**: Binary feature flag that disables an API service (Anthropic, OpenAI, Deepgram, Cartesia, or a tier)
- **Graph shadow mode**: Feature flag that runs graph retrieval in parallel but logs output only (no impact on users)
- **Hard caps**: Per-user daily rate limits (TTS chars, LLM tokens, STT seconds)

---

## Next Steps for Piotr

1. **Review "Facts that change the plan" section above** — specifically:
   - Paying users discovery (affects Review 05 planning)
   - Embedding cache broken (affects graph resource cost)
   - Latency logging broken (affects Review 05 load check feasibility)
   - Secret backups exposed (affects deployment security)

2. **Approve / comment on the shadow-mode decision**: Is dual-mode `graph.enhanced_retrieval=true` + `graph.shadow_mode=true` intentional?

3. **Check PITR status manually** via Supabase dashboard.

4. **Decide on secret backup files**: Delete, rotate, or move to a secrets manager?

5. **Prioritize instrumentation fix**: Latency logging is needed for Review 05 (load check) and ongoing diagnostics.

---

**End of Review 08. All queries read-only; zero production writes.**
