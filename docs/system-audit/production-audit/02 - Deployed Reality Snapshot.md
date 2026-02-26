---
title: "Deployed Reality Snapshot"
date: 2026-02-25
tags: [audit, deployment, infrastructure, heydpe]
status: current
evidence_level: high
audit_ref: prod-reality-audit-20260224
---

# Deployed Reality Snapshot

What is actually running in production as of 2026-02-24. Not what was planned, not what the docs say — what the deployed system actually does.

---

## Git State

| Property | Value |
|----------|-------|
| HEAD commit | `6b82b95` |
| Commit message | "Add multi-line label blocks to 2D and 3D graph views" |
| Branch | `main` (production deploys from this branch) |
| Audit branch | `prod-reality-audit-20260224` |
| Tests | **464 passed**, 0 failed, 24 test files |
| Typecheck | **Clean** (zero errors) |
| Test framework | Vitest |

> [!note] Test health
> 464 tests passing with zero failures and clean typecheck represents a healthy codebase. Test coverage spans exam logic, RAG filters, timing utilities, TTL cache, eval helpers, session policy, browser detection, and email routing across 24 test files.

---

## Environment Identification

| Environment | Supabase Project Ref | Purpose |
|-------------|---------------------|---------|
| **Production** | `pvuiwwqsumoqjepukjhz` | Live user-facing system |
| **Staging** | `curpdzczzawpnniaujgq` | Pre-production testing |

**Live URL**: https://aviation-oral-exam-companion.vercel.app

---

## Build and Deployment Architecture

```
GitHub (main branch)
    |
    | push triggers
    v
Vercel (auto-deploy)
    |
    | builds with
    v
Next.js 16.1.6 (App Router, Turbopack)
    |
    | connects to
    v
Supabase (pvuiwwqsumoqjepukjhz)
    |-- PostgreSQL + pgvector
    |-- Row Level Security
    |-- Auth (email/password)
    |-- RPC functions
    v
External APIs
    |-- Anthropic (Claude Sonnet 4.6) - examiner + assessment
    |-- OpenAI - embeddings + TTS (one provider)
    |-- Cartesia - TTS (tier provider)
    |-- Deepgram - TTS (tier provider)
```

**Deployment model**: Every push to `main` triggers an automatic Vercel deployment. No manual deployment step. No staging gate between merge and production (staging is a separate Supabase instance, not a separate Vercel deployment).

---

## System Configuration Flags (Production)

These flags are stored in the `system_config` table and control runtime behavior without code changes.

### Active Feature Flags

| Flag | Value | Effect |
|------|-------|--------|
| `graph.enhanced_retrieval` | **ENABLED** | Knowledge graph retrieval is active in the RAG pipeline |
| `graph.shadow_mode` | **ENABLED** | Graph results are fetched and logged but may not be authoritative for task selection |

### Absent Feature Flags (Defaulting to Disabled)

| Flag | Status | Effect |
|------|--------|--------|
| `rag.metadata_filter` | **NOT SET** | Metadata filtering in RAG queries defaults to disabled |
| `tts_sentence_stream` | **NOT SET** | Per-sentence TTS streaming is not active (enabled in staging only) |

### Kill Switches

| Switch | Value |
|--------|-------|
| All kill switches | **DISABLED** |
| `maintenance_mode` | **DISABLED** |

### User Hard Caps

| Cap | Value |
|-----|-------|
| `daily_llm_tokens` | 100,000 |
| `daily_tts_chars` | 50,000 |
| `daily_stt_seconds` | 3,600 (1 hour) |

> [!risk] Shadow mode implications
> `graph.enhanced_retrieval` is ENABLED but `graph.shadow_mode` is also ENABLED. This means the knowledge graph is being queried on every exchange (consuming compute and adding latency), but the results may not be driving actual exam behavior. This is appropriate for validation but represents unnecessary latency if shadow mode has been running long enough to confirm graph quality. Review whether shadow mode should be promoted to active or disabled.

---

## Active Code Paths (What Actually Runs)

Based on the system config flags, latency logs, and database state, these are the code paths that execute in production today:

### Exam Flow (Active)

1. **Session creation** (`POST /api/session` action=create) -- Creates `exam_sessions` row
2. **Exam start** (`POST /api/exam` action=start) -- Selects first ACS task, generates examiner question
3. **Student response** (`POST /api/exam` action=respond) -- Two Claude calls:
   - `assessAnswer()` -- Scores response (satisfactory/unsatisfactory/partial)
   - `generateExaminerTurn()` -- Produces next examiner statement using full history
4. **Next task** (`POST /api/exam` action=next-task) -- Selects next ACS task from uncovered set
5. **Session update** (`POST /api/session` action=update) -- Updates exchange count, covered tasks, status

### RAG Pipeline (Active)

Confirmed active via latency log spans:

1. **Prechecks** (126-208ms) -- Auth validation, session lookup
2. **Embedding generation** (210-1,022ms) -- OpenAI embedding of student answer
   - Includes cache check (39-87ms) against `embedding_cache` table
   - Cache hit rate: **0%** (zero reuse recorded)
3. **Hybrid search** (148-3,839ms) -- `chunk_hybrid_search` RPC combining vector + FTS
4. **Image search** (40-91ms) -- `get_images_for_chunks` RPC fetching linked figures
5. **Graph retrieval** (included in rag.total) -- Enhanced retrieval is ON, shadow mode is ON

### TTS Pipeline (Active)

- Multi-provider factory selects between Cartesia, Deepgram, and OpenAI based on tier
- Per-paragraph streaming implemented (commit `149aa9d`)
- `tts_sentence_stream` NOT enabled in production (staging only)

### Auth Flow (Active)

1. Email/password signup via Supabase Auth
2. Confirmation email with code
3. Code exchange at `/auth/callback`
4. Middleware protects dashboard routes (`/practice`, `/progress`, `/settings`)
5. 11 user profiles in production

### Observability (Active)

- 83 latency log entries tracking per-exchange timing spans
- 1,355 usage log entries tracking API consumption
- Spans cover: prechecks, rag.*, llm.*, tts.*

---

## Dormant Code Paths (Present but Not Executing)

### Metadata Filter RAG

- `rag.metadata_filter` is absent from `system_config`
- Code exists (32 unit tests for `rag-filters.ts`) but the feature is not activated
- Filter inference logic is tested but not invoked in the production RAG pipeline

### Sentence-Level TTS Streaming

- `tts_sentence_stream` is enabled in staging but not set in production
- Per-paragraph streaming is active; per-sentence streaming is not
- The 3-paragraph detection logic (commit `149aa9d`) is deployed but sentence-level granularity is gated

### Knowledge Graph as Authoritative Source

- Graph retrieval runs (shadow mode) but results may not drive task selection or examiner behavior
- 22,075 concepts and 45,728 relations are populated and queryable
- Whether graph results actually influence the examiner output depends on shadow mode implementation details

### Admin Interface

- Admin RLS policies exist in the database
- `admin_users` table exists
- No admin UI is deployed — all admin operations require direct Supabase dashboard access

### Rating-Specific Prompts

- `prompt_versions.rating` column exists
- All 24 prompt versions have `rating=NULL`
- Rating differentiation relies on dynamic ACS context in the system prompt, not on per-rating prompt variants

### Page-Level Citations

- `source_chunks.page_start` column exists
- Zero chunks have this field populated
- Citation display exists but cannot reference specific page numbers

---

## Staging Environment Divergence

Key differences between staging and production that affect testing fidelity:

| Aspect | Production | Staging |
|--------|-----------|---------|
| `graph.enhanced_retrieval` | ENABLED | DISABLED |
| `graph.shadow_mode` | ENABLED | DISABLED |
| `tts_sentence_stream` | NOT SET | ENABLED |
| Concepts | 22,075 | 2,348 |
| Relations | 45,728 | 2,317 |
| Evidence links | 30,689 | 0 |
| Source images | 1,596 | 0 |
| Chunk-image links | 7,460 | 0 |
| Embedding cache | 84 | 0 |
| Latency logs | 83 | 0 |

> [!risk] Staging parity
> Staging has no source images, no evidence links, no embedding cache entries, and graph retrieval is disabled. This means the RAG pipeline in staging operates fundamentally differently from production. Any bug related to image retrieval, graph-enhanced search, or embedding caching cannot be caught in staging. Consider syncing a subset of production data to staging for higher-fidelity testing.

---

## What a User Experiences Today

A user visiting https://aviation-oral-exam-companion.vercel.app today will:

1. See a landing page with product description
2. Sign up with email/password, receive confirmation email
3. After confirming, access the practice page
4. Configure a session: select rating (private/commercial/instrument), difficulty, flow mode, persona
5. Start a voice-first oral exam with an AI DPE
6. Speak answers (Chrome only) or type them
7. Hear the examiner's response via TTS (multi-provider)
8. See visual references (charts, figures) when relevant to the question
9. Receive per-element grading (satisfactory/unsatisfactory/partial)
10. View progress and session history on the progress page
11. Resume paused sessions

The system supports 11 registered users, has conducted 70 exam sessions with 720 exchanges, and has graded 306 individual ACS element attempts.

---

*Snapshot taken: 2026-02-24 at commit 6b82b95. See [[01 - Requirements and Non-Negotiables]] for gap analysis and [[03 - Production DB Snapshot]] for detailed data metrics.*
