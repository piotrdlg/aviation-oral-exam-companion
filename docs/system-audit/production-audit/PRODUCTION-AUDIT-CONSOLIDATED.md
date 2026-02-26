---
title: "HeyDPE Production Audit — Consolidated"
date: 2026-02-24
type: consolidated-audit
tags: [aviation-oral-exam, production-audit, heydpe, system-audit, consolidated]
status: active
audit_ref: prod-reality-audit-20260224
documents_included: 12
---

# HeyDPE Production Audit — Consolidated Document

> This file consolidates all 12 production audit documents (00 through 11) into a single file for LLM context upload. Individual documents remain in this directory for Obsidian browsing. This consolidated version is optimized for single-file ingestion.

---

<!-- DOCUMENT 00 -->

# Production Audit — Index

> [!info] How to Use This Audit Pack
> Start here. This index links every document in the production audit series. Read [[01 - Requirements and Non-Negotiables]] and [[02 - Deployed Reality Snapshot]] first to understand what the product must do and what it actually does. Then read [[10 - Drift vs Existing Docs]] to see where earlier documentation has gone stale. Finally, read [[11 - Recommendations and Next Tasks]] for the prioritized action plan.

---

## Key Findings

1. **The system works end-to-end** — three exam ratings (Private, Commercial, Instrument) are live with 143 ACS tasks, AI-driven assessment, and multi-provider TTS.
2. **Knowledge graph is real** — 22K concepts, 45K relations, 30K evidence links. GraphRAG is enabled in production (`enhanced_retrieval=true`). The earlier "empty graph" risk (doc 03/06) is resolved.
3. **RAG quality has gaps** — embedding cache writes are broken (`cache_reused=0`), all 4,674 chunks lack page numbers (`page_start=0`), and metadata filtering is coded but not enabled in prod.
4. **Earlier documentation has significant drift** — four of ten original audit docs (01, 02, 03, 04) contain materially incorrect claims about versions, chunk counts, scheduling model, and graph status.
5. **Latency instrumentation is active but incomplete** — 83 production logs exist, but `exchange.total` is always null due to a streaming path bug.
6. **Exam realism features are missing** — no question budget, no follow-up probe limit, no graph-ordered topic transitions. These are the next product-quality improvements.
7. **Two stop-the-line items** — embedding cache bug (cost + latency waste) and missing page tracking (broken citation grounding) should be fixed before new feature work.

---

## Document Map

### Production Audit Series (this directory)

| # | Document | Purpose | Status |
|---|----------|---------|--------|
| 00 | [[00 - Index]] | This file. Links and summarizes all audit documents. | Active |
| 01 | [[01 - Requirements and Non-Negotiables]] | Core product requirements with implementation status. What the product *must* do. | Current |
| 02 | [[02 - Deployed Reality Snapshot]] | What is actually running in production as of 2026-02-24. Database counts, feature flags, config state. | Current |
| 10 | [[10 - Drift vs Existing Docs]] | Line-by-line comparison of each original audit doc (01-10) against production reality. Identifies stale claims. | Current |
| 11 | [[11 - Recommendations and Next Tasks]] | Prioritized action plan: P1 knowledge correctness, P2 exam realism, P3 latency. Includes code touchpoints, rollback strategies, and implementation sequence. | Active |

### Artifacts

| Artifact | Location | Contents |
|----------|----------|----------|
| artifacts/ | `production-audit/artifacts/` | Supporting data, query results, and evidence files referenced by audit documents |

### Original Audit Series (parent directory)

These documents were written earlier in development. See [[10 - Drift vs Existing Docs]] for a detailed assessment of which claims remain accurate.

| # | Document | Purpose | Drift Level |
|---|----------|---------|-------------|
| 01 | [[../01 - Tech Stack Inventory]] | Technology choices and versions | High — versions outdated |
| 02 | [[../02 - Current Architecture Map]] | System architecture diagram and component descriptions | High — missing GraphRAG, multi-rating, personas |
| 03 | [[../03 - Knowledge Base and Retrieval Pipeline]] | RAG pipeline design and knowledge base statistics | High — chunk count wrong, risks resolved |
| 04 | [[../04 - Exam Flow Engine]] | Exam scheduling and session management | High — scheduling model changed to element-level |
| 05 | [[../05 - Latency Audit and Instrumentation Plan]] | Latency targets and instrumentation design | Medium — now active in prod |
| 06 | [[../06 - GraphRAG Proposal for Oral Exam Flow]] | Proposal for knowledge graph integration | Superseded — implemented and live |
| 07 | [[../07 - Optimization Roadmap]] | Planned optimizations and their status | Medium — many items completed |
| 08 | [[../08 - PAL MCP Research Log]] | Research notes on PAL MCP integration | None — reference material |
| 09 | [[../09 - Staging Verification]] | Staging environment verification | Low |
| 10 | [[../10 - Staging Environment and Safe Deployment]] | Staging deployment procedures | Low |

---

## Quick Reference: Current Production State

| Metric | Value |
|--------|-------|
| Framework | Next.js 16.1.6 |
| AI Model | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| ACS Tasks | 143 (PA: 61, CA: 60, IR: 22) |
| Source Chunks | 4,674 |
| Concepts | 22,151 |
| Relations | 45,233 |
| Evidence Links | 30,419 |
| DPE Personas | 4 |
| TTS Providers | 3 (OpenAI, Deepgram, Cartesia) |
| Latency Logs | 83 |
| Embedding Cache Reuse | 0 (broken) |
| Metadata Filter | Code ready, flag not set |
| GraphRAG | Enabled (`enhanced_retrieval=true`) |

---

## Reading Order

For a full understanding of the system state and next steps:

1. [[01 - Requirements and Non-Negotiables]] — what must be true
2. [[02 - Deployed Reality Snapshot]] — what is true
3. [[10 - Drift vs Existing Docs]] — where docs diverged from reality
4. [[11 - Recommendations and Next Tasks]] — what to do next

For a quick status check, read this index and [[11 - Recommendations and Next Tasks]] only.
---

<!-- DOCUMENT 01 -->

# Requirements and Non-Negotiables

This document enumerates the core product requirements for HeyDPE. Each requirement is tagged with its current implementation status based on the production reality snapshot taken 2026-02-24 at commit `6b82b95`.

---

## R1 — Grounded in Official FAA Sources

**Requirement**: All exam content must be traceable to official FAA publications. The knowledge base must include PHAK (Pilot's Handbook of Aeronautical Knowledge), AFH (Airplane Flying Handbook), AIM (Aeronautical Information Manual), 14 CFR (Federal Aviation Regulations), IFH (Instrument Flying Handbook), AWH (Aviation Weather Handbook), and other official references.

**Why non-negotiable**: A student who studies incorrect or ungrounded material risks failing the real checkride. The product's credibility depends on FAA-source fidelity.

**Production evidence**:
- 172 source documents ingested into `source_documents`
- 4,674 chunks extracted into `source_chunks`
- 1,596 source images (charts, figures, tables) in `source_images`
- 7,460 chunk-image links connecting visual references to text
- 30,689 concept-chunk evidence links grounding the knowledge graph to source material
- 1,555 transcript citations linking examiner statements back to source chunks

> [!risk] Gap: page_start tracking
> Zero chunks have `page_start` populated. This means citations cannot currently reference a specific page number in the source document. Students cannot be told "see PHAK page 4-12" — only the chunk text is available. This degrades the study-aid value of citations.

---

## R2 — Predetermined Exam Length with Controlled Probing

**Requirement**: Each exam session has a question budget (predetermined beginning and end). When a student answers incorrectly, the examiner may ask a limited number of follow-up probes to determine if the deficiency is isolated or systemic, but probing must not be unbounded.

**Why non-negotiable**: Real DPE oral exams have a finite scope. Unbounded probing creates anxiety and unrealistic exam simulation. The question budget also controls API costs.

**Production evidence**:
- 70 exam sessions recorded (14 completed, 21 active, 8 paused, 27 abandoned)
- 720 session transcripts across those sessions (~10.3 exchanges per session average)
- 24 prompt versions control examiner behavior including probing depth
- `user_hard_caps` enforce daily limits: 100,000 LLM tokens, 50,000 TTS characters, 3,600 STT seconds

> [!note] Observation: abandonment rate
> 27 of 70 sessions (38.6%) are abandoned. This could indicate the exam length feels too long, or that users are experimenting. Requires UX investigation.

---

## R3 — ACS Compliance Across Ratings

**Requirement**: The exam must follow the FAA Airman Certification Standards for each supported rating. Currently supported:
- Private Pilot Airplane (FAA-S-ACS-6C) — 61 tasks
- Commercial Pilot Airplane (FAA-S-ACS-7B) — 60 tasks
- Instrument Rating (FAA-S-ACS-8C) — 22 tasks

Certificate-level depth differences must be respected. A commercial-level question on aerodynamics should demand deeper understanding than a private-level question on the same topic.

**Why non-negotiable**: The ACS is the legal standard the real DPE uses. Misalignment means the student prepares for the wrong exam.

**Production evidence**:
- `acs_tasks`: 143 rows (61 private + 60 commercial + 22 instrument) — matches specification exactly
- `acs_elements`: 2,174 rows covering Knowledge, Risk Management, and Skill elements
- Task ID format enforced: `PA.*` (private), `CA.*` (commercial), `IR.*` (instrument)
- 306 element-level attempts recorded in `element_attempts`, enabling per-element grading
- Prompt versions (24 total) do NOT yet have `rating` field populated — all are `rating=NULL`

> [!risk] Gap: rating-specific prompts
> All 24 prompt versions have `rating=NULL`. This means the same prompt wording is used regardless of whether the student is preparing for a private or commercial checkride. Certificate-level depth differentiation depends entirely on the system prompt's dynamic ACS context, not on tuned prompt variants per rating.

---

## R4 — Difficulty Modes

**Requirement**: The system must support difficulty modes — easy, medium, hard, and mixed — that meaningfully change questioning style, depth, and follow-up behavior. "Easy" should be encouraging with simpler questions. "Hard" should simulate a strict DPE with edge-case scenarios.

**Why non-negotiable**: Students at different preparation levels need different challenge levels. A student two weeks out should practice on hard; a student just starting should use easy.

**Production evidence**:
- 24 prompt versions include variants for `studyMode x difficulty` combinations
- 10 examiner_system variants and 10 assessment_system variants suggest difficulty is parameterized in the prompt layer
- Difficulty selection is available in the practice configuration UI

---

## R5 — Linear vs Across-ACS Flow

**Requirement**: Two session modes must be supported:
- **Linear**: Work through tasks within a single ACS area sequentially
- **Across-ACS**: Move between ACS areas, but transitions must be logically connected (e.g., weather discussion naturally leads to flight planning), not random jumping

**Why non-negotiable**: Real DPE exams flow conversationally across topics. Random jumping feels artificial and fails to simulate the actual checkride experience.

**Production evidence**:
- The exam engine supports `next-task` action with `coveredTaskIds` tracking
- `get_uncovered_acs_tasks()` RPC exists to find untested areas
- 22,075 concepts and 45,728 relations form a knowledge graph that could power logical transitions
- `graph.enhanced_retrieval` is ENABLED in production
- `graph.shadow_mode` is ENABLED — meaning graph results are fetched but may not yet drive task selection directly

> [!todo] Verify across-ACS transition logic
> Shadow mode being enabled suggests the graph-driven transitions are being evaluated but not yet authoritative. Need to confirm whether across-ACS mode produces genuinely connected transitions or falls back to random selection.

---

## R6 — Examiner Personas

**Requirement**: Multiple examiner personalities must be supported, each with a distinct probing style, tone, and conversational approach. This simulates the reality that different DPEs have different examination styles.

**Why non-negotiable**: Students benefit from practicing with different examiner temperaments. A student who only practices with a friendly examiner may be caught off guard by a strict one.

**Production evidence**:
- 4 persona prompts exist in `prompt_versions` (out of 24 total versions)
- Persona selection is a configurable parameter in session setup

---

## R7 — Visual Questions with Linked Figures

**Requirement**: The examiner must be able to reference and display visual materials — METAR strips, sectional chart excerpts, regulation tables, weather charts, aircraft performance charts — as part of questions. These visuals must be linked to their source documents.

**Why non-negotiable**: The real DPE oral exam frequently uses visual aids. A candidate must interpret METARs, read charts, and reference regulation tables. Text-only simulation is incomplete.

**Production evidence**:
- 1,596 source images in `source_images`
- 7,460 chunk-image links in `chunk_image_links`
- `get_images_for_chunks` RPC confirmed working via latency data (rag.imageSearch spans: 40-91ms)
- Image search is part of the active RAG pipeline in production

---

## R8 — Admin-Tunable Versioned Prompts

**Requirement**: All system prompts (examiner persona, assessment rubric, grading criteria) must be stored in the database and versioned. Prompt changes must not require a code deployment. Administrators must be able to A/B test prompt variants.

**Why non-negotiable**: Prompt engineering is iterative. Requiring a redeploy for every prompt tweak slows iteration to a crawl and risks deploying broken prompts to all users simultaneously.

**Production evidence**:
- `prompt_versions` table with 24 rows
- 10 examiner_system variants, 10 assessment_system variants, 4 persona prompts
- Prompts are loaded from database at runtime, not hardcoded
- No admin UI exists yet — prompt changes require direct database edits

> [!todo] Admin UI for prompt management
> No admin interface exists for managing prompt versions. Currently requires direct Supabase dashboard access. This is a friction point for non-technical prompt iteration.

---

## R9 — Precise Grading with Weak-Area Identification

**Requirement**: The grading system must identify specific ACS elements where the student is weak. Feedback must be granular — not just "you failed Area III" but "you were unsatisfactory on PA.III.A.K2 (airport markings) and partial on PA.III.B.K1 (airspace classification)." Future sessions can be generated to target these specific weaknesses.

**Why non-negotiable**: Targeted practice is the fastest path to checkride readiness. Generic feedback wastes study time.

**Production evidence**:
- 306 element-level attempts in `element_attempts` — grading happens at the ACS element level
- 2,174 ACS elements available for granular tracking
- Each exam exchange triggers an `assessAnswer()` call that scores as satisfactory/unsatisfactory/partial
- Session coverage tracked via `acs_tasks_covered` JSONB array
- Progress page aggregates stats across all sessions

---

## R10 — Quick Weak-Areas Drill Mode

**Requirement**: A "study mode" or "weak areas drill" must exist that focuses exclusively on ACS elements the student has previously scored poorly on. This mode should skip areas of demonstrated competence and concentrate study time on deficiencies.

**Why non-negotiable**: Students preparing for a checkride in days, not weeks, need maximum efficiency. Drilling weak areas is the highest-ROI use of limited study time.

**Production evidence**:
- `studyMode` is a parameter in prompt variant selection
- Prompt versions include studyMode-specific variants
- `get_uncovered_acs_tasks()` RPC can identify untested areas
- Element-level attempt history (306 records) provides the data needed to identify weak elements

---

## R11 — Voice-First with Low-Latency TTS

**Requirement**: The primary interaction mode is voice. Text-to-speech must have low enough latency that the conversation feels natural. Multiple TTS providers must be supported for quality and reliability. Speech-to-text enables hands-free student responses.

**Why non-negotiable**: The real checkride is an oral exam — spoken, not typed. Voice simulation is the core product differentiator.

**Production evidence**:
- Multi-provider TTS architecture: Cartesia, Deepgram, OpenAI (tier-based selection via provider factory)
- `tts_sentence_stream` feature flag exists (enabled in staging, not yet set in prod)
- 83 latency logs in production tracking voice pipeline performance
- STT via Web Speech API (Chrome only, interim results)
- Per-paragraph TTS streaming implemented (commit `149aa9d`)
- User hard caps: 50,000 TTS characters/day, 3,600 STT seconds/day

**Latency profile (production, recent 20 exchanges)**:

| Span | p50 | p95 |
|------|-----|-----|
| rag.total | ~700ms | ~4,900ms |
| rag.embedding | ~400ms | ~1,000ms |
| rag.hybridSearch | ~225ms | ~3,800ms |
| rag.imageSearch | ~55ms | ~90ms |
| llm.examiner.ttft | ~1,150ms | ~3,400ms |
| llm.assessment.total | ~5,800ms | ~9,900ms |

> [!risk] Latency concern: assessment total
> Assessment calls (p50 ~5.8s, p95 ~9.9s) are the slowest span. Since assessment runs after the student answers and before the next examiner turn, this adds perceptible delay to the conversation loop. The per-paragraph TTS streaming (commit `149aa9d`) helps mask examiner generation latency but does not help with assessment latency.

---

## R12 — Session Persistence and Resume

**Requirement**: Exam sessions must be persistable and resumable. A student who closes the browser mid-exam must be able to return and continue where they left off. Session state includes conversation history, covered ACS tasks, and current task context.

**Why non-negotiable**: Oral exams can last 1-2 hours. Browser crashes, phone calls, and life interruptions are inevitable. Losing progress is unacceptable.

**Production evidence**:
- 70 sessions in `exam_sessions` with status tracking (active/completed/paused/abandoned)
- 720 transcripts in `session_transcripts` preserving full Q&A history
- 8 sessions in "paused" state — confirming pause/resume is being used
- Session CRUD via `/api/session` (create, update, list)
- `acs_tasks_covered` tracked as JSONB array per session

---

## Requirements Status Summary

| # | Requirement | Status | Gaps |
|---|------------|--------|------|
| R1 | FAA source grounding | Implemented | No page_start tracking for citations |
| R2 | Question budget + controlled probing | Implemented | High abandonment rate needs investigation |
| R3 | ACS compliance across ratings | Implemented | No rating-specific prompt variants yet |
| R4 | Difficulty modes | Implemented | Needs validation of meaningful differences |
| R5 | Linear vs across-ACS flow | Partial | Graph in shadow mode; transition logic unverified |
| R6 | Examiner personas | Implemented | 4 personas available |
| R7 | Visual questions | Implemented | Image search active in RAG pipeline |
| R8 | Admin-tunable prompts | Partial | No admin UI; requires direct DB access |
| R9 | Precise grading | Implemented | 306 element-level attempts recorded |
| R10 | Weak-areas drill | Implemented | StudyMode variants exist in prompt system |
| R11 | Voice-first low-latency | Implemented | Assessment latency is high (p50 ~5.8s) |
| R12 | Session persistence/resume | Implemented | 8 paused sessions confirm usage |

---

*Audit performed: 2026-02-24. Next review: after addressing [[03 - Production DB Snapshot#Key Anomalies]] gaps.*
---

<!-- DOCUMENT 02 -->

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
---

<!-- DOCUMENT 03 -->

# Production DB Snapshot

Detailed database state captured from production Supabase (`pvuiwwqsumoqjepukjhz`) on 2026-02-24. All numbers are exact row counts unless otherwise noted.

---

## Table Row Counts

### Content Pipeline

| Table | Rows | Description |
|-------|------|-------------|
| `source_documents` | 172 | Ingested FAA publications (PHAK, AFH, AIM, CFR, IFH, AWH, etc.) |
| `source_chunks` | 4,674 | Text chunks extracted from source documents |
| `source_images` | 1,596 | Charts, figures, tables extracted from source documents |
| `chunk_image_links` | 7,460 | Many-to-many links between chunks and their associated images |
| `embedding_cache` | 84 | Cached embedding vectors for query deduplication |

### Knowledge Graph

| Table | Rows | Description |
|-------|------|-------------|
| `concepts` | 22,075 | Knowledge graph nodes (all have embeddings) |
| `concept_relations` | 45,728 | Knowledge graph edges (6 relation types) |
| `concept_chunk_evidence` | 30,689 | Links grounding concepts to source chunks |

### ACS Structure

| Table | Rows | Description |
|-------|------|-------------|
| `acs_tasks` | 143 | ACS task definitions (private=61, commercial=60, instrument=22) |
| `acs_elements` | 2,174 | Knowledge/Risk/Skill elements within tasks |

### Exam Activity

| Table | Rows | Description |
|-------|------|-------------|
| `exam_sessions` | 70 | User exam sessions |
| `session_transcripts` | 720 | Individual Q&A exchanges |
| `element_attempts` | 306 | Per-element grading results |
| `transcript_citations` | 1,555 | Source references in examiner responses |
| `latency_logs` | 83 | Per-exchange timing telemetry |
| `usage_logs` | 1,355 | API consumption tracking |

### System

| Table | Rows | Description |
|-------|------|-------------|
| `prompt_versions` | 24 | Versioned system prompts (10 examiner, 10 assessment, 4 persona) |
| `user_profiles` | 11 | Registered users |

---

## Session Status Distribution

| Status | Count | Percentage |
|--------|-------|------------|
| Active | 21 | 30.0% |
| Abandoned | 27 | 38.6% |
| Completed | 14 | 20.0% |
| Paused | 8 | 11.4% |
| **Total** | **70** | **100%** |

> [!risk] High abandonment rate
> 38.6% of sessions are abandoned. Combined with 30% still "active" (which may include stale sessions that were never properly closed), the effective completion rate may be as low as 20%. Possible causes:
> - Sessions left open in browser tabs (active but stale)
> - Exam length feels too long
> - Users experimenting with the product without intent to complete
> - Technical issues (latency, voice recognition failures) causing drop-off
>
> **Recommended action**: Implement session timeout to auto-transition stale "active" sessions to "abandoned" after a configurable period. Investigate whether abandoned sessions cluster at specific exchange counts (early dropout vs mid-exam).

---

## Coverage Metrics Analysis

### Embedding Coverage

| Metric | Value | Assessment |
|--------|-------|------------|
| Total chunks | 4,674 | |
| Chunks with embeddings | 4,624 | 98.9% coverage |
| Chunks missing embeddings | **50** | 1.1% gap |
| Concepts with embeddings | 22,075 / 22,075 | 100% coverage |

> [!note] 50 chunks without embeddings
> 50 of 4,674 chunks (1.1%) lack embedding vectors. These chunks are invisible to vector search and will never be retrieved by the RAG pipeline. If they contain critical content (e.g., emergency procedures, regulatory minimums), this is a safety gap. Identify which source documents these chunks belong to and re-run embedding generation.

### Page Tracking

| Metric | Value |
|--------|-------|
| Chunks with `page_start` | **0** |
| Chunks without `page_start` | 4,674 (100%) |

> [!risk] Zero page tracking
> Not a single chunk has `page_start` populated. This means:
> - Citations cannot reference specific pages in source documents
> - Students cannot be directed to "see PHAK page 4-12" for further study
> - The `page_start` column exists in the schema but was never populated during ingestion
>
> **Impact**: Degrades the study-aid value of transcript citations. The 1,555 transcript citations link to chunk text but not to a page reference the student can look up in their physical copy of the book.

### Embedding Cache Effectiveness

| Metric | Value |
|--------|-------|
| Cache entries | 84 |
| Cache hits (reuse count > 0) | **0** |
| Cache hit rate | **0%** |

> [!risk] Embedding cache never hits
> 84 entries exist in `embedding_cache` but zero have been reused. The cache check runs on every exchange (39-87ms per check), adding latency without benefit. Possible causes:
> - Cache key is too specific (exact query match instead of semantic similarity)
> - Students rarely ask identical questions
> - Cache TTL is too short and entries expire before reuse
>
> **Recommended action**: Either fix the cache key strategy to use approximate matching, or disable the cache check to save 39-87ms per exchange. At current hit rate, the cache is pure overhead.

---

## Concept Graph State

The knowledge graph is the largest data structure in the system:

| Component | Count | Notes |
|-----------|-------|-------|
| Concepts (nodes) | 22,075 | All have embeddings |
| Relations (edges) | 45,728 | 6 relation types |
| Evidence links | 30,689 | Grounding concepts to source chunks |

### Concepts by Category (Partial — Supabase Default Limit)

| Category | Count | Notes |
|----------|-------|-------|
| `acs_area` | 31 | ACS areas of operation |
| `acs_element` | 969 | ACS knowledge/risk/skill elements |
| Other categories | ~21,075 | topic, regulatory_claim, definition, procedure, artifact — exact breakdown unavailable due to Supabase 1000-row default limit on the snapshot query |

> [!note] Category breakdown incomplete
> The snapshot query returned only the first 1,000 rows per category grouping due to Supabase's default pagination limit. The full breakdown of 22,075 concepts across categories (topic, regulatory_claim, definition, procedure, artifact, etc.) requires a dedicated aggregation query.

### Relations by Type (Partial)

| Type | Count (from snapshot) | Notes |
|------|----------------------|-------|
| `is_component_of` | 1,000+ | First 1,000 rows captured; actual total across all types is 45,728 |

> [!todo] Full relation type breakdown
> Only the first 1,000 `is_component_of` relations were captured in the snapshot. A `GROUP BY type` aggregation query is needed to get the true distribution across all 6 relation types (likely: `is_component_of`, `related_to`, `requires`, `prerequisite_for`, `contradicts`, `exemplifies` or similar).

---

## System Configuration State

### Feature Flags

| Key | Value | Environment |
|-----|-------|-------------|
| `graph.enhanced_retrieval` | `true` | Production |
| `graph.shadow_mode` | `true` | Production |
| `rag.metadata_filter` | *(absent)* | Production — defaults to disabled |
| `tts_sentence_stream` | *(absent)* | Production — defaults to disabled |

### Kill Switches

All kill switches are **disabled**. `maintenance_mode` is **disabled**.

### User Hard Caps

| Cap | Value | Daily Reset |
|-----|-------|-------------|
| `daily_llm_tokens` | 100,000 | Yes |
| `daily_tts_chars` | 50,000 | Yes |
| `daily_stt_seconds` | 3,600 | Yes |

---

## RPC Function Presence

### Detection Method and Its Limitations

RPC presence was checked by calling each function with empty parameters and observing whether the error indicated "function not found" vs "invalid parameters." This technique returned `false` for all RPCs tested.

> [!note] RPC detection was unreliable
> The empty-params detection technique proved unreliable. **However**, latency logs conclusively prove the following RPCs are functional in production:
>
> - **`chunk_hybrid_search`** — latency spans show `rag.hybridSearch` timing (148-3,839ms)
> - **`get_images_for_chunks`** — latency spans show `rag.imageSearch` timing (40-91ms)
> - **`get_uncovered_acs_tasks`** — used by the `next-task` exam action
>
> The RPCs exist and work. The detection technique simply cannot confirm presence when functions require specific parameter signatures.

---

## Latency Statistics

Derived from the 20 most recent production exchange latency logs.

### Per-Span Latency

| Span | p50 (median) | p95 | Min | Max |
|------|-------------|-----|-----|-----|
| `prechecks` | ~155ms | ~208ms | 126ms | 208ms |
| `rag.total` | ~700ms | ~4,900ms | 475ms | 4,929ms |
| `rag.embedding` | ~400ms | ~1,000ms | 210ms | 1,022ms |
| `rag.embedding.openai` | ~350ms | ~970ms | 155ms | 972ms |
| `rag.embedding.cache_check` | ~55ms | ~87ms | 39ms | 87ms |
| `rag.hybridSearch` | ~225ms | ~3,800ms | 148ms | 3,839ms |
| `rag.imageSearch` | ~55ms | ~90ms | 40ms | 91ms |
| `llm.examiner.ttft` | ~1,150ms | ~3,400ms | 780ms | 3,432ms |
| `llm.assessment.total` | ~5,800ms | ~9,900ms | 2,843ms | 9,940ms |

### Latency Budget Breakdown (Median Exchange)

```
Student speaks answer
    |
    v
prechecks ............... ~155ms
rag.total ............... ~700ms
  |- rag.embedding ...... ~400ms
  |    |- openai ........ ~350ms
  |    |- cache_check ... ~55ms
  |- rag.hybridSearch ... ~225ms
  |- rag.imageSearch .... ~55ms
llm.assessment.total .... ~5,800ms
llm.examiner.ttft ....... ~1,150ms
    |
    v
TTS begins streaming
```

**Total median latency from answer to first TTS audio**: approximately **7,800ms** (prechecks + RAG + assessment + examiner TTFT). The per-paragraph TTS streaming means the student hears the first paragraph before the full response is generated.

> [!risk] p95 worst case
> At p95, the total latency stretches to approximately **18,400ms** (208 + 4,900 + 9,900 + 3,400). Nearly 20 seconds from answer to first audio at the 95th percentile. This is a degraded user experience that may contribute to session abandonment.

> [!todo] Latency optimization targets
> 1. **Assessment latency** (p50 5.8s) is the dominant span. Consider: streaming assessment, parallel assessment + examiner generation, or simplified assessment for easy-mode sessions.
> 2. **Hybrid search outliers** (p95 3.8s vs p50 225ms) suggest occasional database performance issues. Investigate whether specific query patterns trigger slow plans.
> 3. **Embedding cache** adds 55ms per exchange with 0% hit rate. Either fix or remove.

---

## Prompt Version Analysis

| Type | Count | Rating-Specific |
|------|-------|-----------------|
| `examiner_system` | 10 | None (all `rating=NULL`) |
| `assessment_system` | 10 | None (all `rating=NULL`) |
| `persona` | 4 | None (all `rating=NULL`) |
| **Total** | **24** | **0** |

The 10 examiner and 10 assessment variants cover combinations of `studyMode` and `difficulty` parameters. All 24 versions have `rating=NULL`, meaning no rating-specific prompt tuning exists.

> [!note] Prompt variant matrix
> With 4 difficulty levels (easy/medium/hard/mixed) and at least 2 study modes, the expected variant count is 8+ per prompt type. The 10 variants each for examiner and assessment suggest slightly more granularity (possibly including default/fallback variants). The 4 persona prompts are independent of difficulty and study mode.

---

## Key Anomalies

### 1. page_start = 0 Everywhere

**Severity**: Medium
**Impact**: Citations lack page references; students cannot look up source material by page number
**Root cause**: Ingestion pipeline did not extract page numbers from PDFs
**Fix**: Re-run ingestion with page extraction enabled, or backfill via PDF metadata analysis

### 2. Embedding Cache Hit Rate = 0%

**Severity**: Low-Medium
**Impact**: 39-87ms wasted per exchange on a cache that never helps
**Root cause**: Likely exact-match cache keys on queries that are never identical
**Fix**: Switch to approximate matching, implement semantic cache, or disable cache check

### 3. Session Abandonment at 38.6%

**Severity**: Medium-High
**Impact**: Majority of sessions don't complete; unclear whether this represents product issues or expected behavior
**Root cause**: Unknown — could be UX, latency, session length, or user experimentation
**Fix**: Add session timeout logic, analyze abandonment timing patterns, add exit surveys

### 4. 50 Chunks Without Embeddings

**Severity**: Low
**Impact**: 1.1% of content invisible to vector search
**Root cause**: Likely failed embedding API calls during ingestion
**Fix**: Identify affected chunks and re-run embedding generation

### 5. 21 "Active" Sessions (Possibly Stale)

**Severity**: Low-Medium
**Impact**: Inflates active user metrics; may indicate missing session cleanup
**Root cause**: No session timeout mechanism
**Fix**: Implement auto-abandonment after configurable inactivity period

---

## Production vs Staging Drift

| Dimension | Production | Staging | Drift Severity |
|-----------|-----------|---------|----------------|
| **Supabase ref** | `pvuiwwqsumoqjepukjhz` | `curpdzczzawpnniaujgq` | -- |
| **graph.enhanced_retrieval** | ENABLED | DISABLED | **High** |
| **graph.shadow_mode** | ENABLED | DISABLED | **High** |
| **tts_sentence_stream** | NOT SET | ENABLED | Medium |
| **concepts** | 22,075 | 2,348 | **High** (10.6% parity) |
| **concept_relations** | 45,728 | 2,317 | **High** (5.1% parity) |
| **concept_chunk_evidence** | 30,689 | 0 | **Critical** (0% parity) |
| **source_images** | 1,596 | 0 | **Critical** (0% parity) |
| **chunk_image_links** | 7,460 | 0 | **Critical** (0% parity) |
| **embedding_cache** | 84 | 0 | Low |
| **latency_logs** | 83 | 0 | Low (expected) |
| **source_documents** | 172 | *(not captured)* | Unknown |
| **source_chunks** | 4,674 | *(not captured)* | Unknown |

> [!risk] Staging cannot test production code paths
> With zero source images, zero evidence links, and graph retrieval disabled, the staging environment exercises a fundamentally different code path than production. The following production behaviors CANNOT be tested in staging:
>
> 1. Image retrieval and display (`get_images_for_chunks` has no data)
> 2. Graph-enhanced retrieval (feature flag disabled)
> 3. Concept-to-source grounding (zero evidence links)
> 4. Embedding cache behavior (no cache entries)
>
> **Recommendation**: Create a staging data sync script that copies a representative subset of production content data (source_documents, source_chunks, source_images, concepts, relations, evidence) to staging. User data and sessions should NOT be synced.

---

## Data Relationship Integrity

### Expected Ratios

| Ratio | Value | Assessment |
|-------|-------|------------|
| Chunks per document | 4,674 / 172 = **27.2** | Reasonable for FAA documents |
| Images per document | 1,596 / 172 = **9.3** | Reasonable for chart-heavy publications |
| Image links per image | 7,460 / 1,596 = **4.7** | Each image referenced by ~5 chunks on average |
| Relations per concept | 45,728 / 22,075 = **2.1** | Sparse graph — typical for hierarchical ACS structure |
| Evidence per concept | 30,689 / 22,075 = **1.4** | Most concepts grounded in 1-2 source chunks |
| Transcripts per session | 720 / 70 = **10.3** | ~10 exchanges per session |
| Citations per transcript | 1,555 / 720 = **2.2** | ~2 source references per examiner response |
| Element attempts per session | 306 / 70 = **4.4** | ~4-5 elements graded per session |
| Prompts: examiner vs assessment | 10 / 10 = **1.0** | Symmetric — expected |

---

*Snapshot taken: 2026-02-24 from Supabase project pvuiwwqsumoqjepukjhz at commit 6b82b95. See [[01 - Requirements and Non-Negotiables]] for product gap analysis and [[02 - Deployed Reality Snapshot]] for runtime behavior mapping.*
---

<!-- DOCUMENT 04 -->

# 04 — RAG Grounding Audit

## Purpose

This document audits the Retrieval-Augmented Generation (RAG) pipeline that supplies FAA source material to the Claude examiner and assessor. It traces every stage from query construction through embedding, retrieval, filtering, and prompt injection, and evaluates whether the system provides adequate grounding guarantees — i.e., whether the examiner's questions and the assessor's feedback are reliably anchored in authoritative FAA publications.

---

## 1. Query Construction

**File**: `src/lib/exam-engine.ts:197-199`

```typescript
const recentText = history.slice(-2).map(m => m.text).join(' ');
const answerText = studentAnswer ? ` ${studentAnswer}` : '';
const query = `${task.task} ${recentText}${answerText}`.slice(0, 500);
```

The RAG query is built by concatenating three sources:

1. **`task.task`** — The ACS task description (e.g., "Aeromedical Factors")
2. **`recentText`** — The text of the last 2 conversation messages (examiner + student)
3. **`answerText`** — The student's current answer, if present

The result is truncated to 500 characters.

> [!risk] Query Dilution
> The last two conversation turns often contain conversational filler, examiner preamble, or student hedging. When concatenated with the task description, the embedding vector drifts toward the average of all three semantic signals rather than targeting the specific knowledge element being tested. A student answer about "Coriolis illusion" appended to an examiner question about "spatial disorientation" and a task title of "Aeromedical Factors" produces a query that may retrieve broadly relevant PHAK content rather than the specific paragraph on Coriolis illusion.

> [!risk] No Element Code in Query
> The current element code (e.g., `PA.II.E.K2`) is available in `plannerState` but is NOT used in query construction. Element codes map directly to specific ACS knowledge requirements and could dramatically improve retrieval precision if used as a filter or query prefix.

> [!note] 500-Character Truncation
> For most exchanges the concatenation stays under 500 characters. However, verbose student answers can push the total well past this limit, and the `.slice(0, 500)` operation may cut the student's answer mid-sentence or remove it entirely, leaving only the task title and examiner's prior question as the search signal.

---

## 2. Embedding and Caching

**File**: `src/lib/rag-retrieval.ts:45-93`

**Model**: OpenAI `text-embedding-3-small`

**Cache mechanism**:
- Table: `embedding_cache`
- Key: SHA-256 hash of the normalized (lowercased, whitespace-collapsed) query string
- On cache hit: returns stored 1536-dimensional vector directly
- On cache miss: calls OpenAI Embeddings API, writes result to `embedding_cache` via non-blocking Supabase insert

> [!risk] Cache Writes Silently Failing
> Production observation: **0 cache hits** recorded. The non-blocking write (`supabase.from('embedding_cache').insert(...)` without `await` or error handling) may be silently failing due to RLS policies, column type mismatches, or network timeouts. Every query pays the full OpenAI embedding latency (~80-150ms) on every request. This is a latency tax, not a correctness issue, but it indicates an untested write path.

> [!note] Embedding Model Choice
> `text-embedding-3-small` is the lowest-cost OpenAI embedding model. It performs well on general text but has not been benchmarked against aviation-specific retrieval tasks. The 1536-dimensional output is stored in Supabase's pgvector column. No dimensionality reduction or quantization is applied.

---

## 3. Hybrid Search

**File**: `src/lib/rag-retrieval.ts:99-141`

**RPC function**: `chunk_hybrid_search`

| Parameter | Value | Notes |
|-----------|-------|-------|
| `match_count` | 5 (from `fetchRagContext`) | Default in RPC is 6 |
| `similarity_threshold` | 0.3 | Cosine similarity floor |
| `filterDocType` | Optional | From `inferRagFilters` if enabled |
| `filterAbbreviation` | Optional | From `inferRagFilters` if enabled |

The hybrid search combines:
1. **Vector similarity** — pgvector cosine distance against the query embedding
2. **Full-text search (FTS)** — PostgreSQL `tsvector` matching against the query text
3. **Combined scoring** — Weighted blend of vector and FTS scores (weights defined in the RPC)

> [!note] Similarity Threshold
> The 0.3 threshold is relatively permissive. For `text-embedding-3-small`, cosine similarities in the 0.3-0.4 range often indicate only loose topical overlap. This means the system will return chunks that are vaguely related to the query even when no highly relevant content exists, potentially injecting misleading context.

> [!risk] No Result Quality Gate
> There is no post-retrieval check on whether the returned chunks are actually relevant to the specific ACS element being tested. If all 5 results score between 0.3 and 0.45, the system treats them identically to results scoring 0.85+. The examiner receives them all as "FAA SOURCE MATERIAL" without any signal about retrieval confidence.

---

## 4. Metadata Filtering

**Files**: `src/lib/rag-filters.ts`, `src/lib/rag-search-with-fallback.ts`

**Feature flag**: `rag.metadata_filter`

> [!risk] DISABLED in Production
> The `rag.metadata_filter` feature flag is **not set** in the production feature flags table. This means `inferRagFilters` is never called, and all searches are unfiltered. The entire metadata filtering subsystem — regex-based document type detection, two-pass fallback logic, and minimum result thresholds — is dead code in production.

**How it would work if enabled**:

1. `inferRagFilters` scans conversation text for document type patterns:
   - PHAK references (e.g., "Pilot's Handbook", "PHAK chapter")
   - AFH references (e.g., "Airplane Flying Handbook")
   - AIM references (e.g., "AIM section", "Aeronautical Information Manual")
   - CFR references (e.g., "14 CFR", "FAR 91")

2. Two-pass fallback (`rag-search-with-fallback.ts`):
   - **Pass 1**: Search with inferred `filterDocType` and/or `filterAbbreviation`
   - **Gate check**: If results < `MIN_RESULTS` (2) or top score < `MIN_TOP_SCORE` (0.4), fall back
   - **Pass 2**: Repeat search without filters

> [!note] Design Intent
> The filtering system is well-designed for its purpose: when a student mentions "14 CFR 91.205", the system should prefer retrieving the actual regulation text over a PHAK paraphrase. The two-pass fallback prevents empty results. However, since it is disabled, all searches return an unweighted mix of document types, and regulatory text competes with handbook paraphrases on embedding similarity alone.

---

## 5. Image Retrieval

**File**: `src/lib/rag-retrieval.ts:186-211`

**RPC function**: `get_images_for_chunks`

**Production data**: 1,596 images, 7,460 chunk-to-image links

After text chunks are retrieved, the system fetches associated images:

1. Collected chunk IDs from the hybrid search results
2. Call `get_images_for_chunks` RPC with those IDs
3. Sort by `relevance_score` descending
4. Take top 3 images
5. Send image URLs to client for display
6. Pass image URLs to `assessAnswer` for visual question assessment

> [!note] Image Pipeline Is Functional
> Unlike metadata filtering, image retrieval is active in production. The 7,460 links provide good coverage across PHAK and AFH figures. The top-3 limit keeps payload size manageable.

> [!risk] No Image Relevance Verification
> Images are linked to chunks at ingestion time, not at query time. If a chunk is marginally relevant (similarity 0.31), its linked images may be entirely irrelevant to the current question. The student sees authoritative-looking FAA diagrams that may not correspond to the topic under discussion.

---

## 6. Graph Retrieval Integration

**File**: `src/lib/graph-retrieval.ts`, `src/lib/exam-engine.ts:207-263`

**Feature flags**:
- `graph.enhanced_retrieval` — **ENABLED** in production
- `graph.shadow_mode` — **ENABLED** in production

**RPC function**: `get_concept_bundle`

When both flags are enabled, `enhanced_retrieval` takes precedence over `shadow_mode`. The graph retrieval path:

1. Extract `elementCode` from the current `plannerState`
2. Call `get_concept_bundle` RPC with that element code
3. Format the returned bundle into structured sections:
   - REGULATORY REQUIREMENTS
   - KEY CONCEPTS
   - DEFINITIONS
   - COMMON STUDENT ERRORS
   - SUGGESTED FOLLOW-UP DIRECTIONS
   - REFERENCES
4. Prepend the formatted graph context before the RAG chunk context in the system prompt

> [!note] Graph Context Is Active
> Unlike metadata filtering, graph retrieval is live and injecting structured knowledge into the examiner prompt. This provides element-specific context that the RAG query construction misses (since element codes are not used in RAG queries).

> [!risk] Dual Context Without Deduplication
> The examiner receives both graph context (element-specific, structured) and RAG context (query-driven, unstructured) without any deduplication. If the graph bundle includes a concept definition and the RAG results include a chunk from the same PHAK page, the examiner sees redundant information consuming prompt tokens. More critically, if the two sources present slightly different formulations of the same fact, the model may synthesize rather than choose, introducing subtle inaccuracies.

> [!risk] Graph Completeness Unknown
> The knowledge graph was populated via migration `20260220100002` with ACS skeleton data. The completeness of concept bundles per element code is not audited. Elements with sparse or missing graph data fall back to RAG-only context silently, with no logging to track which elements lack graph support.

---

## 7. Prompt Injection and Grounding Guarantees

### How Retrieved Context Reaches Claude

RAG chunks are formatted by `formatChunksForPrompt` and injected into the system prompt under the header:

```
FAA SOURCE MATERIAL (use to ask accurate, specific questions):
```

Graph context (when enabled) is prepended before the RAG section.

### Grounding Analysis

> [!risk] No Grounding Enforcement — Critical Gap
> The system provides **advisory** context to Claude but does **not enforce** that responses must be grounded in that context. Specifically:
>
> 1. **No citation mandate**: The system prompt says "use to ask accurate, specific questions" but does not instruct Claude to cite sources or refuse to answer when sources are insufficient.
>
> 2. **Assessment allows null sources**: The `assessAnswer` prompt defines `source_summary` as optional — "If no FAA source material was provided, set to null." This means the assessor can evaluate a student's answer without any FAA reference, relying entirely on Claude's parametric knowledge.
>
> 3. **No entailment verification**: There is no second-pass check that the examiner's questions or the assessor's feedback are entailed by the retrieved content. Claude may generate questions about topics not covered in the retrieved chunks.
>
> 4. **No authority weighting**: A PHAK paraphrase and a 14 CFR regulation carry equal weight in the prompt. The system does not instruct Claude to prefer regulatory text over handbook explanations, or to flag conflicts between sources.
>
> 5. **No retrieval confidence signal**: Claude receives the chunks without knowing their similarity scores. A chunk at 0.31 similarity looks identical to one at 0.92. The model cannot self-calibrate its confidence based on retrieval quality.

---

## 8. Known Failure Modes

| # | Failure Mode | Trigger | Impact | Severity |
|---|-------------|---------|--------|----------|
| 1 | **Query dilution** | Verbose student answer pushes task title out of 500-char window | Retrieves content unrelated to the ACS element | Medium |
| 2 | **Cache write failure** | Non-blocking insert silently fails | Every query pays full embedding latency (~100ms) | Low |
| 3 | **Low-relevance results treated as authoritative** | All results between 0.3-0.4 similarity | Examiner asks questions based on tangentially related content | High |
| 4 | **Metadata filtering disabled** | Feature flag not set | Cannot target specific FAA publications (CFR vs PHAK) | Medium |
| 5 | **Ungrounded examiner questions** | No citation enforcement in system prompt | Examiner may ask questions from parametric knowledge, not FAA sources | High |
| 6 | **Ungrounded assessment feedback** | `source_summary` is optional | Assessor may evaluate answers against Claude's beliefs, not FAA standards | High |
| 7 | **Graph-RAG deduplication gap** | Same content in graph bundle and RAG chunks | Wasted prompt tokens; potential for conflicting formulations | Low |
| 8 | **Irrelevant images surfaced** | Low-relevance chunk has linked images | Student sees FAA diagrams unrelated to current topic | Medium |

---

## 9. Next Correctness Levers

These are prioritized improvements that would materially strengthen grounding. None are implemented; this section describes what each would entail.

### 9.1 — Enforce Citation in System Prompt

Add explicit instructions to both the examiner and assessor system prompts:

- "You MUST base your questions on the FAA SOURCE MATERIAL provided. If the source material does not cover a topic, state that you are moving to a topic with available references."
- "In your assessment, cite the specific source chunk number (e.g., [1], [3]) that supports your evaluation. If no source supports the student's claim, explicitly state 'not supported by provided sources.'"

**Effort**: Prompt engineering only. No code changes. Highest ROI lever.

### 9.2 — Add Retrieval Confidence Signal

Pass similarity scores to Claude alongside chunks:

```
[1] PHAK — Aerodynamics (p.42) [relevance: 0.87]
content...

[2] AIM — Weather Services (p.7-1) [relevance: 0.34]
content...
```

Add instruction: "Prefer sources with relevance > 0.6. Treat sources below 0.5 as supplementary only."

**Effort**: Modify `formatChunksForPrompt` to include scores. Prompt changes.

### 9.3 — Use Element Code in Query Construction

Replace the current query construction with:

```typescript
const elementDesc = currentElement.description || '';
const query = `${elementDesc} ${task.task} ${recentText}`.slice(0, 500);
```

Or better, pass the element code as a metadata filter to the hybrid search, restricting results to chunks tagged with the relevant ACS element.

**Effort**: Modify `exam-engine.ts:197-199`. May require chunk-to-element tagging in the database if not already present.

### 9.4 — Enable Metadata Filtering

Set the `rag.metadata_filter` feature flag to `true` in production. The code is already written and tested (32 unit tests in `rag-filters.test.ts`). Monitor the two-pass fallback rate to ensure filtered searches return sufficient results.

**Effort**: Single database update. Monitor for 1-2 weeks.

### 9.5 — Add Post-Retrieval Quality Gate

Before injecting chunks into the prompt, check:

- If top score < 0.5, log a warning and add a preamble: "Note: retrieved sources have low relevance to this specific question."
- If fewer than 2 chunks above 0.5, consider triggering a second retrieval with a reformulated query (e.g., element description only, without conversation history).

**Effort**: New function in `rag-retrieval.ts`. Moderate complexity.

### 9.6 — Authority Weighting by Document Type

Add document type hierarchy to the prompt:

```
Authority hierarchy (prefer higher-ranked sources):
1. 14 CFR (regulations — legally binding)
2. AIM (procedures — FAA standard)
3. PHAK / AFH (handbooks — educational)
4. AC (advisory circulars — guidance)
```

**Effort**: Prompt engineering. Requires `doc_type` to be reliably set on chunks (already present in schema).

### 9.7 — Entailment Verification Pass

Add a lightweight third Claude call (or use a smaller model) that takes the examiner's generated question + the retrieved chunks and returns a boolean: "Is this question answerable from the provided sources?" If not, regenerate or flag.

**Effort**: High. Adds latency and cost. Consider as a quality gate for production, not a per-request check. Could be implemented as a sampling audit (check 10% of exchanges).

---

*Audit conducted 2026-02-24. Based on production state as of commit `80dbc7e`.*
---

<!-- DOCUMENT 05 -->

# 05 — Exam Flow and Difficulty Audit

## Purpose

This document audits the exam flow orchestration: how the system selects which ACS elements to test, in what order, how difficulty is determined, and how the examiner persona behaves. It identifies gaps between the current implementation and the behavior of a real FAA Designated Pilot Examiner conducting an oral examination.

---

## 1. PlannerState and Queue Building

**File**: `src/lib/exam-logic.ts:337-395`

### PlannerState Structure

The planner maintains state across the exam session:

```typescript
interface PlannerState {
  queue: string[];          // Ordered list of element codes
  cursor: number;           // Current position in queue
  recent: string[];         // Last 5 element codes tested (anti-repeat)
  studyMode: StudyMode;     // linear | cross_acs | weak_areas
  rating: string;           // PA | CA | IR
  difficulty: string;       // easy | medium | hard | mixed
  currentElement?: string;  // Element code currently being tested
}
```

### Queue Building (buildElementQueue)

**File**: `src/lib/exam-logic.ts:337-395`

The element queue is constructed at session start through a multi-step filtering pipeline:

1. **Area/Task filter**: If `selectedTasks` is provided, include only elements belonging to those tasks. Otherwise, if `selectedAreas` is provided, include only elements in those areas. If neither is set, include all elements for the rating.

2. **Difficulty filter**: If difficulty is not `mixed`, filter elements to those matching the requested difficulty level. If this filter removes ALL elements, the filter is silently skipped and all elements are retained.

3. **Skill element exclusion**: Elements with S-type codes (e.g., `PA.IV.A.S1`) are always removed. These represent flight skills that cannot be tested in an oral exam.

4. **Ordering**: Applied based on study mode (see Section 2).

> [!note] Silent Difficulty Fallback
> When difficulty filtering would produce an empty queue, the system silently falls back to including all difficulty levels (`exam-logic.ts:140-146`). This is a reasonable defensive measure, but the user receives no indication that their difficulty preference was ignored. A student selecting "hard" may receive easy questions without knowing why.

> [!risk] No Minimum Queue Size Check
> If area/task filtering combined with difficulty filtering produces a very small queue (e.g., 2-3 elements), the session will cycle through them rapidly and either complete quickly or loop with the anti-repeat mechanism struggling against the small pool. There is no minimum queue size validation or warning.

---

## 2. Study Modes

**File**: `src/lib/exam-logic.ts:337-395`

### Linear Mode

Elements are ordered by their code in natural sort order:

```
PA.I.A.K1 → PA.I.A.K2 → PA.I.A.K3 → PA.I.A.R1 → PA.I.B.K1 → ...
```

This follows the ACS document structure: Area I, Task A, then all Knowledge elements, then Risk Management elements, then Area I Task B, and so on.

> [!note] Predictable but Useful
> Linear mode is the most predictable study experience. Students working through the ACS systematically will find this natural. However, it does not simulate a real oral exam, where the examiner jumps between areas based on the student's responses.

### Cross-ACS Mode

Elements are shuffled using Fisher-Yates algorithm at queue build time.

> [!risk] Random Shuffle vs. Logical Connections
> The current cross-ACS mode produces a truly random ordering. A student might be asked about `PA.I.A.K1` (Pilot Qualifications) followed by `PA.VIII.B.K3` (Emergency Equipment) followed by `PA.III.A.K2` (Performance Charts). A real DPE creates **logically connected transitions** — discussing weather leads to weather-related regulations, which leads to weather minimums for the planned flight, which leads to alternate airport requirements. The random shuffle eliminates these natural teaching connections.
>
> **Desired behavior**: When transitioning between elements, the system should prefer elements that are semantically or topically connected to the current element. The knowledge graph (`concept_relations` table with 6 relation types) exists and could power this, but is not used for transition planning.

### Weak Areas Mode

Elements are assigned weights based on prior performance:
- `unsatisfactory` = 5 (highest priority)
- `partial` = 4
- `untouched` = 3
- `satisfactory` = 1 (lowest priority, but still included)

Selection uses weighted random sampling.

> [!note] Data Source
> Weak areas weights are derived from `get_element_scores` RPC, which reads the `element_attempts` table. This creates a genuine adaptive review loop: elements the student struggled with appear more frequently in subsequent sessions.

> [!risk] Cold Start Problem
> A brand-new user with no `element_attempts` data will have all elements weighted at 3 (`untouched`), making weak_areas mode functionally identical to cross_acs mode (uniform random). The UI does not communicate this, and a new student selecting "Focus on Weak Areas" may expect targeted review they cannot yet receive.

---

## 3. Element Selection and Advancement

**File**: `src/lib/exam-logic.ts:400-441`

### pickNextElement

The advancement algorithm:

1. Start at `cursor` position in `queue`
2. Check if the element at `cursor` is in the `recent` list (last 5 elements)
3. If in `recent`, increment `cursor` and try the next element
4. If not in `recent`, select it as the current element
5. Add it to `recent` (maintaining max 5)
6. Increment `cursor`
7. If `cursor` exceeds queue length, wrap to 0

### Anti-Repeat Mechanism

The `recent` list of 5 prevents the same element from appearing twice within a 5-element window. This is important for small queues where the cursor wraps frequently.

> [!risk] Infinite Loop with Tiny Queues
> If the queue has 5 or fewer elements and all are in the `recent` list, the algorithm will loop through every position finding them all "recent." The code handles this by eventually selecting an element anyway (falling through the recent check), but the behavior is not explicitly documented or tested for edge cases like queue size = 1.

### Session Completion

Two completion triggers:
1. **Queue exhausted**: All elements have been visited. The system calls `computeExamResult` with trigger `all_tasks_covered`.
2. **User ends session**: Student clicks "End Exam." Trigger is `user_ended`.

> [!note] Queue Exhaustion vs. All Covered
> "Queue exhausted" means the cursor has visited every position. Since elements can be skipped (via the recent mechanism) or revisited (via cursor wrapping), "queue exhausted" is not precisely "every element tested once." The system tracks coverage via the `acs_tasks_covered` array on the session, which records task-level (not element-level) coverage.

---

## 4. No Predetermined Question Budget

> [!risk] Missing Question Budget — Key Gap
> A real FAA oral exam has a natural scope: the DPE covers all required ACS areas with enough depth to make a determination, typically taking 1-2 hours. The current system has **no predetermined question budget**. Sessions run until:
>
> - The queue is exhausted (which could be 143 elements for Private Pilot), or
> - The student manually ends the session
>
> There is no mechanism to say "ask approximately 60 questions across all areas, spending proportionally more time on areas where the student struggles."

### Insertion Points for Question Budget

A question budget could be implemented at these locations:

1. **Queue construction** (`exam-logic.ts:337-395`): Instead of including all filtered elements, sample a budget-sized subset with proportional area representation. E.g., for a 60-question exam across 9 areas, allocate ~7 elements per area with adjustment for area size.

2. **Planner advancement** (`exam-logic.ts:400-441`): Add a counter to `PlannerState` and check against budget before selecting the next element. When budget is reached, trigger completion.

3. **API route** (`api/exam/route.ts`): The `respond` action could check `exchange_count` against a configured budget and return a completion signal instead of advancing the planner.

4. **Session config**: Add `questionBudget` to the session configuration alongside `studyMode` and `difficulty`. Allow the user to set this in the practice configuration UI.

> [!todo] Recommended Approach
> Option 2 (planner-level counter) is the cleanest insertion point. It keeps the budget logic in the pure-logic layer (`exam-logic.ts`), makes it testable, and does not require API route changes. The counter would be a new field on `PlannerState` and checked in `pickNextElement`.

---

## 5. Difficulty Modes

**Files**: `src/lib/exam-logic.ts:140-146`, `src/lib/exam-planner.ts:133-134`

### Session-Level Difficulty

Difficulty is a session-level configuration, not a per-element adaptive property:

| Setting | Behavior |
|---------|----------|
| `easy` | All elements use easy difficulty prompts |
| `medium` | All elements use medium difficulty prompts |
| `hard` | All elements use hard difficulty prompts |
| `mixed` | Each element uses its `difficulty_default` from the database |

**File**: `src/lib/exam-planner.ts:133-134`

When difficulty is not `mixed`, the planner overrides every element's difficulty with the session setting. When `mixed`, it reads `difficulty_default` from the element record.

> [!risk] No Adaptive Difficulty
> The system does not adjust difficulty based on student performance within a session. A student answering every question correctly at "medium" will never be promoted to "hard" questions. A student struggling will never be dropped to "easy." This is a static experience that does not mirror how a real DPE adjusts their questioning depth.

> [!note] Difficulty Affects Prompt, Not Element Selection
> Difficulty does not change which elements are selected (except via the initial filter in `buildElementQueue`). It changes the system prompt instructions to Claude, asking for easier or harder questions on the same element. The mapping between difficulty levels and prompt language is stored in the `prompt_versions` table.

### Difficulty Filtering Edge Case

**File**: `src/lib/exam-logic.ts:140-146`

```
If difficulty != 'mixed':
  filtered = elements.filter(e => e.difficulty_level === difficulty)
  if filtered.length === 0:
    filtered = elements  // silent fallback
```

> [!risk] Inconsistent User Experience
> If a rating has no elements tagged as "hard" in the database (because `difficulty_default` was never set or defaults to "medium"), a user selecting "hard" gets the full unfiltered queue at whatever default difficulty the prompt provides. The user's explicit preference is silently discarded.

---

## 6. Examiner-Led Flow — Not Enforced

### How a Real DPE Operates

A real Designated Pilot Examiner:
1. **Leads the conversation** — decides the topic, depth, and transitions
2. **Follows up on weak answers** — probes deeper when a student gives a partial or incorrect answer
3. **Creates logical transitions** — "You mentioned you'd check weather. What specific weather products would you use?" naturally transitions from flight planning to weather services
4. **Adjusts scope dynamically** — spends more time on areas of weakness, less on areas of demonstrated competence
5. **Has a mental model of coverage** — knows which areas have been satisfactorily covered and which still need testing

### Current System Behavior

> [!risk] Examiner Does Not Lead
> The current system inverts the DPE model. The **planner** decides which element to test next. The **examiner** (Claude) generates a question for that element. The examiner reacts to the student's answer within the scope of the current element, but has no agency to:
>
> - Decide to probe deeper (the planner advances to the next element after each exchange)
> - Choose a logically connected follow-up topic
> - Skip an area because the student demonstrated mastery through a related answer
> - Circle back to an earlier topic based on something the student said
>
> The examiner is a question-generating function, not a test conductor.

### Follow-Up Questions

The `assessAnswer` output includes a `follow_up_needed` boolean field. When `true`, it indicates the assessor believes the student's answer requires follow-up probing. However:

> [!risk] follow_up_needed Not Acted Upon
> The `follow_up_needed` signal from assessment is available but the planner does not use it to decide whether to stay on the current element or advance. The planner always advances to the next element in the queue regardless of assessment outcome. This means a student who gives a dangerously wrong answer about airspace regulations will be moved to an unrelated topic rather than being probed further — the opposite of what a real DPE would do.

---

## 7. Linear vs. Cross-ACS: Current State vs. Desired State

### Current State

| Mode | Ordering | Transitions | Realism |
|------|----------|-------------|---------|
| Linear | ACS document order | Sequential through codes | None (textbook study) |
| Cross-ACS | Fisher-Yates random | Random jumps | Low (no logical connections) |
| Weak Areas | Weighted random | Random jumps | Low (adaptive but random) |

### Desired State

A realistic oral exam mode would:

1. **Start with a scenario**: "You're planning a cross-country flight from KJAX to KATL in a Cessna 172. Walk me through your planning process." This naturally covers weather (Area VII), performance (Area III), regulations (Area I), and airspace (Area VI).

2. **Follow the student's thread**: If the student mentions checking NOTAMs, follow up on NOTAM types and sources before moving to the next topic.

3. **Use knowledge graph edges**: The `concept_relations` table with its 6 relation types (`prerequisite_of`, `related_to`, `component_of`, `tested_with`, `regulatory_basis_for`, `common_misconception_with`) could power logically connected transitions.

4. **Maintain a coverage map**: Track which ACS areas have been satisfactorily covered and steer toward uncovered areas.

> [!todo] Scenario-Based Mode
> A future "scenario" study mode would require:
> - A scenario generator that selects a flight profile covering multiple ACS areas
> - A transition planner that uses knowledge graph edges to find connected elements
> - Examiner autonomy to follow up within an element before advancing
> - Coverage tracking at the area level with minimum depth requirements

---

## 8. Examiner Personalities

### Four Personas

The system supports 4 examiner personas stored in the `prompt_versions` table. Each persona has a distinct system prompt that shapes Claude's communication style:

| Persona | Description | Behavioral Traits |
|---------|-------------|-------------------|
| Standard DPE | Default professional examiner | Formal, methodical, by-the-book |
| Friendly DPE | Approachable examiner | Encouraging, patient, conversational |
| Strict DPE | Demanding examiner | Concise, expects precision, challenges assumptions |
| Socratic DPE | Teaching-oriented examiner | Answers questions with questions, guides discovery |

> [!note] Persona Affects Style, Not Substance
> All personas test the same ACS elements and use the same assessment criteria. The persona changes the examiner's tone, follow-up style, and encouragement level, but does not affect scoring or element selection. This is a good design decision — personality should not change the standard being applied.

> [!risk] Persona Prompts Not Audited for Grounding
> The persona system prompts were not reviewed as part of the RAG grounding audit (Document 04). If any persona prompt includes instructions that override or dilute the grounding instructions (e.g., "feel free to share your own aviation experience"), it could increase hallucination risk for that persona.

---

## 9. Missing Features Summary

| # | Feature | Current State | Impact | Priority |
|---|---------|--------------|--------|----------|
| 1 | **Question budget** | No limit; runs until queue exhausted or user ends | Sessions have no natural scope | High |
| 2 | **Follow-up probing** | `follow_up_needed` computed but not acted upon | Weak answers not challenged | High |
| 3 | **Logically connected transitions** | Random shuffle in cross_acs mode | Unrealistic exam flow | Medium |
| 4 | **Adaptive difficulty** | Static per-session setting | No response to student performance | Medium |
| 5 | **Scenario-based mode** | Not implemented | Cannot simulate real oral exam structure | Medium |
| 6 | **Examiner flow control** | Planner controls flow, examiner generates questions | Examiner cannot lead the test | High |
| 7 | **Coverage-aware steering** | Queue-based; no area-level tracking during session | Cannot ensure balanced coverage | Medium |
| 8 | **Extra probe limit** | No probing at all (see #2) | No depth control on weak areas | Low |
| 9 | **Difficulty fallback notification** | Silent fallback when filter empties queue | User unaware preference was ignored | Low |
| 10 | **Cold start guidance for weak areas** | Behaves like random for new users | Misleading mode description | Low |

---

## 10. Exam Completion States

The exam can end in the following states:

| Trigger | Condition | Grading Basis |
|---------|-----------|---------------|
| `all_tasks_covered` | Cursor has visited all queue positions | All elements attempted |
| `user_ended` | Student clicks "End Exam" | Only elements actually attempted |
| `session_timeout` | Not implemented | N/A |
| `budget_reached` | Not implemented | N/A |

> [!note] User-Ended Grading Is Fair
> When a student ends early, they are graded only on elements they were actually asked about. This prevents penalizing a student who runs out of time. However, it also means a student can "game" the system by ending the exam after a streak of correct answers, before reaching their weak areas.

> [!todo] Consider Minimum Coverage Requirement
> A real oral exam requires satisfactory demonstration across ALL areas of operation. The system should consider requiring minimum coverage (e.g., at least one element per selected area) before allowing a "pass" grade on user-ended sessions. Data for this check exists in the `score_by_area` computation within `computeExamResult`.

---

*Audit conducted 2026-02-24. Based on production state as of commit `80dbc7e`.*
---

<!-- DOCUMENT 06 -->

# 06 — Grading and Feedback Audit

## Purpose

This document audits the grading subsystem: how student answers are assessed, how scores are computed and persisted, how feedback is generated and grounded (or not), and how the system supports (or fails to support) longitudinal progress tracking and targeted review. It covers the full lifecycle from a student's spoken answer through assessment, scoring, persistence, and eventual use in weak-areas study mode.

---

## 1. assessAnswer Output Format

**File**: `src/lib/exam-engine.ts:605-767`

### Assessment Architecture

Each student answer triggers **two parallel Claude API calls**:

1. **`assessAnswer()`** — Evaluates the student's response against ACS standards
2. **`generateExaminerTurn()`** — Produces the examiner's next question/response

These run concurrently (Promise.all or equivalent) to minimize latency. The assessment result feeds into session tracking and grading; the examiner turn is sent to the client.

### Assessment JSON Schema

The `assessAnswer` function returns a structured JSON object:

```typescript
{
  score: 'satisfactory' | 'unsatisfactory' | 'partial',
  feedback: string,              // Free-form commentary on the answer
  misconceptions: string[],      // Identified knowledge gaps or errors
  follow_up_needed: boolean,     // Whether the answer warrants deeper probing
  primary_element: string,       // ACS element code this answer addresses
  mentioned_elements: string[],  // Other ACS elements touched by the answer
  source_summary: string | null  // Optional FAA source reference
}
```

> [!note] Structured Assessment Is Well-Designed
> The schema captures the key dimensions a real DPE would evaluate: correctness (score), specific feedback, identified misconceptions, whether follow-up is needed, and which ACS elements were addressed. The `mentioned_elements` field enables cross-element coverage tracking from a single answer.

> [!risk] source_summary Is Optional and Unstructured
> The assessment prompt defines `source_summary` as: "If no FAA source material was provided, set to null." This means:
>
> 1. When RAG retrieval returns low-relevance chunks, Claude may choose not to reference them
> 2. When Claude assesses based on parametric knowledge, there is no requirement to disclose this
> 3. The `source_summary` field is free-form text, not a structured citation (no chunk ID, page number, or document reference)
> 4. There is no validation that `source_summary` content actually matches the retrieved RAG chunks

### Assessment Prompt Context

The assessor receives:
- The ACS element definition (knowledge, risk, or skill requirement)
- The student's answer
- RAG-retrieved chunks (same ones sent to the examiner)
- Image URLs (if applicable, for visual questions)
- Conversation history (for context)

> [!risk] Assessment Not Constrained to Sources
> The assessment prompt says to use FAA source material but does not mandate it. Claude can (and likely does) supplement with parametric knowledge when assessing answers on topics where retrieved chunks are sparse or low-relevance. A student could receive feedback like "That's partially correct — the PHAK also discusses..." where the PHAK content referenced is from Claude's training data, not the retrieved chunks.

### Assessment Storage

**File**: `api/exam/route.ts`

Assessment JSON is stored on the `session_transcripts` table in the `assessment` JSONB column. Citations (when present in `source_summary`) are stored in the `transcript_citations` table.

---

## 2. Element Attempts Tracking

**File**: `src/app/api/exam/route.ts:70-124`

### How Attempts Are Recorded

After each assessment, the API route writes to the `element_attempts` table:

```typescript
// Primary element — the element being directly tested
{
  user_id: userId,
  element_code: assessment.primary_element,
  session_id: sessionId,
  score: assessment.score,           // satisfactory | partial | unsatisfactory
  tag_type: 'attempt',               // Primary assessment
  assessed_at: new Date()
}

// Mentioned elements — elements the student touched in passing
for (const mentioned of assessment.mentioned_elements) {
  {
    user_id: userId,
    element_code: mentioned,
    session_id: sessionId,
    score: null,                     // No score for mentions
    tag_type: 'mention',             // Secondary reference
    assessed_at: new Date()
  }
}
```

### Tagging System

| Tag Type | Score | Meaning |
|----------|-------|---------|
| `attempt` | satisfactory / partial / unsatisfactory | Direct assessment of the element |
| `mention` | null | Student referenced the element in their answer but it was not being directly tested |

> [!note] Mention Tracking Enables Rich Analytics
> The `mention` tag type captures when a student demonstrates knowledge of Element B while being tested on Element A. This is valuable for understanding a student's knowledge interconnections and could eventually inform the coverage map (e.g., "The student demonstrated knowledge of PA.III.A.K2 while discussing PA.I.B.K1, so we can deprioritize directly testing PA.III.A.K2").

> [!risk] mention Tag Has No Score
> Mentioned elements are recorded without a score. This means the system knows the student referenced the topic but not whether they did so correctly. A student who incorrectly cites a regulation while answering a different question will have that regulation's element marked as `mention` with no indication of the error. The `mention` record provides no negative signal.

> [!risk] primary_element Determined by Claude
> The `primary_element` field is set by Claude during assessment, not by the planner. If Claude misidentifies which element the answer addresses (e.g., assigns `PA.I.A.K1` when the planner intended `PA.I.A.K2`), the attempt is recorded against the wrong element. There is no validation that `assessment.primary_element` matches the planner's `currentElement`.

---

## 3. computeExamResult Grading Rules

**File**: `src/lib/exam-logic.ts:475-560`

### Point Values

| Score | Points |
|-------|--------|
| `satisfactory` | 1.0 |
| `partial` | 0.7 |
| `unsatisfactory` | 0.0 |

### Pass/Fail Threshold

**Pass**: Overall score >= 70% (0.70)

```
overallScore = pointsEarned / pointsPossible
pass = overallScore >= 0.70
```

Where:
- `pointsEarned` = sum of point values for all assessed elements
- `pointsPossible` = count of assessed elements (NOT total elements in the rating)

> [!risk] Grading Against Asked, Not Total
> The denominator is "elements actually asked," not "total elements in the ACS." This means a student who is asked 10 questions and answers 7 satisfactorily scores 70% and passes, even if the rating has 143 elements. The score reflects performance density, not coverage breadth. A student who ends early after a strong start will have a high score despite low coverage.

### Completion Triggers and Grading Behavior

| Trigger | Grading Basis | Implications |
|---------|--------------|--------------|
| `all_tasks_covered` | All elements in the queue were attempted | Most comprehensive assessment; but checks if asked < total elements in queue and marks `incomplete` if so |
| `user_ended` | Only elements attempted before ending | Student can strategically end after strong performance |
| No elements scored | N/A | Returns `incomplete` status |

### Score Computation Detail

```typescript
function computeExamResult(attempts: ElementAttempt[], trigger: string) {
  // Filter to 'attempt' tag_type only (exclude 'mention')
  const scored = attempts.filter(a => a.tag_type === 'attempt' && a.score);

  if (scored.length === 0) return { status: 'incomplete' };

  const pointsEarned = scored.reduce((sum, a) => {
    if (a.score === 'satisfactory') return sum + 1.0;
    if (a.score === 'partial') return sum + 0.7;
    return sum; // unsatisfactory = 0
  }, 0);

  const pointsPossible = scored.length;
  const overallScore = pointsEarned / pointsPossible;

  // Per-area breakdown
  const scoreByArea = computeScoreByArea(scored);

  return {
    status: overallScore >= 0.70 ? 'pass' : 'fail',
    overallScore,
    pointsEarned,
    pointsPossible,
    scoreByArea,
    trigger
  };
}
```

> [!note] score_by_area Is Computed But Not Enforced
> The function computes per-area scores (e.g., Area I: 85%, Area III: 55%, Area VII: 70%). However, pass/fail is determined solely by the aggregate `overallScore`. A student who scores 100% on easy areas and 0% on critical areas (like regulations or weather) can still pass if the aggregate exceeds 70%.

> [!risk] No Per-Area Minimum
> In a real FAA checkride, a DPE must find satisfactory performance in EACH area of operation, not just overall. A student who demonstrates no knowledge of weather theory (Area VII) would not pass regardless of their performance in other areas. The system's aggregate-only scoring does not enforce this.

### Partial Score Calibration

> [!risk] 0.7 Points for Partial Is Arbitrary
> The 0.7 value for `partial` scores is not calibrated against any FAA standard. In real checkride assessment, answers are either satisfactory or not — there is no "partial credit." The 0.7 value means a student can pass with 100% partial answers (0.7 * N / N = 0.70 = exactly at threshold). Whether this is desirable or too lenient depends on how strictly `partial` is assessed by Claude.

---

## 4. Feedback Grounding Analysis

### Current Feedback Flow

1. Claude receives RAG chunks + graph context + student answer
2. Claude produces `feedback` (free-form string) as part of assessment JSON
3. Feedback is stored in `session_transcripts.assessment`
4. Feedback is available for display on the progress page

### Grounding Gaps

> [!risk] Feedback Is Not Grounded in Sources
> The `feedback` field in the assessment is free-form model commentary with no requirement to cite or reference the provided FAA source material. Claude generates feedback based on a combination of:
>
> 1. Retrieved RAG chunks (when relevant)
> 2. Graph context (when available for the element)
> 3. Claude's parametric knowledge of aviation
> 4. The assessment prompt's general instructions
>
> There is no mechanism to verify that feedback statements are supported by the retrieved sources. A feedback message like "Remember, the maximum altitude for Class D airspace is 2,500 feet AGL" may be correct but sourced from Claude's training data, not the retrieved AIM section.

> [!risk] No Feedback Review or Correction Mechanism
> Incorrect feedback is indistinguishable from correct feedback in the stored data. If Claude provides wrong information in feedback (e.g., citing an incorrect regulation number), it persists in the transcript and could mislead the student in future review. There is no flagging mechanism, no user-reported-error flow, and no periodic audit of feedback accuracy.

### What Would Grounded Feedback Look Like

Grounded feedback would:
1. Reference specific chunk numbers from the retrieved context: "Per [2] (AIM 3-2-1), Class D airspace..."
2. Distinguish between facts from sources vs. general aviation knowledge
3. Flag when no source supports a claim: "Note: I could not verify this in the provided sources"
4. Link to the specific FAA publication page for student follow-up

---

## 5. Score Persistence and Weak Areas

### Persistence Chain

```
Student answer
  → assessAnswer() → assessment JSON
    → element_attempts table (attempt + mention records)
      → get_element_scores RPC (aggregation)
        → buildElementQueue() in weak_areas mode (weighting)
```

### get_element_scores RPC

This RPC aggregates `element_attempts` for a user across all sessions:

- Returns the most recent score for each element code
- Used by `buildElementQueue` to assign weights in weak_areas mode

### Weak Areas Weighting (Recap)

| Last Score | Weight | Effect |
|-----------|--------|--------|
| unsatisfactory | 5 | Appears ~5x more often than satisfactory elements |
| partial | 4 | Appears ~4x more often |
| untouched | 3 | Default for elements never attempted |
| satisfactory | 1 | Still included but rare |

> [!note] Recency-Based Scoring
> Using the MOST RECENT score (not average or worst) means a student who initially scored unsatisfactory but later answered satisfactorily will see that element deprioritized. This creates a genuine spaced-repetition effect: master an element and it fades; struggle and it returns frequently.

> [!risk] Single-Attempt Resolution
> Each element's weight is based on a single most-recent score. A student who answered satisfactorily once (possibly by luck or a leading question) will see that element deprioritized even if they have no deep understanding. Averaging multiple attempts or requiring N consecutive satisfactory scores would be more robust.

### Cross-Session Continuity

Element attempts persist across sessions, so weak_areas mode benefits from historical data. A student who takes 5 sessions will have a well-populated element_attempts table that drives genuinely personalized review in session 6.

> [!note] This Is a Strength
> The persistence of element-level scoring across sessions is one of the system's best features. It creates a genuine learning loop that improves with use.

---

## 6. "Generate Future Exam from Weak Areas" — What Exists vs. What's Missing

### What Exists

1. **Data layer**: `element_attempts` table with per-element, per-session scoring
2. **Aggregation**: `get_element_scores` RPC that returns most-recent scores per element
3. **Study mode**: `weak_areas` mode that uses scores to weight element selection
4. **Per-area breakdown**: `score_by_area` computed in `computeExamResult`

### What's Missing

> [!todo] No "Generate Exam" Feature
> There is no API endpoint or UI feature that takes a student's weak areas and generates a targeted practice exam. The pieces exist:
>
> - `get_element_scores` can identify which elements scored unsatisfactory or partial
> - `buildElementQueue` can filter to specific elements or areas
> - The session config accepts `selectedTasks` and `selectedAreas`
>
> But there is no "Review Weak Areas" button that:
> 1. Calls `get_element_scores` to find elements below threshold
> 2. Groups them by ACS area
> 3. Generates a session config targeting those areas/elements
> 4. Starts a new session with that config
>
> The student must manually select weak_areas mode, which uses weighted random across ALL elements, not a focused exam on just the weak ones.

> [!todo] No Weak Areas Dashboard
> The progress page (`/progress`) shows session history and aggregate stats but does not display:
> - Per-element score history
> - Elements never attempted
> - Elements with declining performance
> - Recommended areas for focused study
>
> The data exists in `element_attempts` but there is no UI to surface it.

> [!todo] No Export or Study Guide Generation
> A valuable feature would be generating a personalized study guide from weak areas:
> - "You scored unsatisfactory on 5 elements in Area VII (Weather). Here are the relevant PHAK chapters and AIM sections."
> - Could use the RAG pipeline to retrieve relevant chunks for each weak element
> - Could generate a PDF or shareable study plan

---

## 7. Pass/Fail Criteria Analysis

### Current Criteria

```
PASS: overallScore >= 0.70
FAIL: overallScore < 0.70
INCOMPLETE: no elements scored OR trigger indicates incomplete coverage
```

### Comparison to FAA Standards

| Dimension | FAA Oral Exam | HeyDPE | Gap |
|-----------|--------------|--------|-----|
| **Per-area requirement** | Must demonstrate satisfactory knowledge in each area | Aggregate score only | No per-area pass/fail |
| **Scoring granularity** | Satisfactory or Unsatisfactory (binary) | Three levels (S/P/U) with partial = 0.7 | Partial credit does not exist in real checkrides |
| **Coverage requirement** | All areas of operation must be tested | No minimum coverage before pass | Can pass with partial coverage |
| **Examiner discretion** | DPE can retest specific areas | No retest mechanism | Elements tested once only |
| **Discontinuance** | DPE can discontinue for weather, aircraft, or safety | No discontinuance concept | N/A for simulator |
| **Letter of Discontinuance** | Preserves passed areas for future attempt | No carry-forward of passed areas between sessions | Each session is independent |

### Recommended Criteria Improvements

> [!todo] Per-Area Minimum Score
> Add a per-area pass requirement. The `score_by_area` data already exists in `computeExamResult`. Add a check:
>
> ```
> for each area in score_by_area:
>   if area.score < 0.70:
>     result.failedAreas.push(area)
>     result.status = 'fail'
> ```
>
> This would catch students who ace some areas and bomb others.

> [!todo] Minimum Coverage Before Pass
> Require that at least one element from each selected area has been attempted before a "pass" grade is awarded. For `user_ended` sessions with incomplete coverage, return status `incomplete` rather than computing a score:
>
> ```
> if (trigger === 'user_ended') {
>   const coveredAreas = new Set(scored.map(a => getAreaFromCode(a.element_code)));
>   const selectedAreas = session.config.selectedAreas;
>   if (coveredAreas.size < selectedAreas.length) {
>     return { status: 'incomplete', reason: 'not_all_areas_covered' };
>   }
> }
> ```

> [!todo] Consider Binary Scoring Option
> Offer a "strict mode" that maps scores to FAA binary:
> - `satisfactory` = pass (1.0)
> - `partial` = fail (0.0) — partial credit does not exist in real checkrides
> - `unsatisfactory` = fail (0.0)
>
> This would be opt-in and more realistic for students doing final checkride preparation.

---

## 8. Assessment Reliability

### Two-Call Architecture Risks

> [!risk] Assessment and Examiner May Diverge
> Since `assessAnswer` and `generateExaminerTurn` are separate Claude calls, they may reach different conclusions about the student's answer. The assessor might score "unsatisfactory" while the examiner responds with "Good, let's move on." This creates a confusing experience where the scored result contradicts the conversational tone.

> [!note] Parallel Execution Is a Good Latency Trade-Off
> Running both calls in parallel saves 1-2 seconds per exchange. The divergence risk is real but infrequent, and the latency benefit is meaningful for a voice-first application where responsiveness matters.

### Assessment Consistency

> [!risk] No Assessment Calibration
> There is no ground truth dataset for calibrating Claude's assessment accuracy. Without a set of known-correct answers and their expected scores, there is no way to measure:
> - Whether Claude's `satisfactory` threshold matches FAA standards
> - Whether partial scores are assigned consistently across elements
> - Whether certain element types (K vs. R) are scored more leniently
> - Whether different examiner personas affect assessment scores (they shouldn't, since assessment and persona are separate prompts)

> [!todo] Assessment Calibration Dataset
> Create a calibration dataset of 50-100 student answers with expert-labeled scores. Run `assessAnswer` against this dataset periodically to measure:
> - Agreement rate with expert labels
> - Score distribution (is Claude too lenient? too strict?)
> - Consistency across elements and areas
> - Drift over time as Claude model versions change

---

## 9. Citation Tracking

### transcript_citations Table

Citations extracted from assessment are stored in `transcript_citations`:

| Column | Type | Content |
|--------|------|---------|
| transcript_id | UUID | FK to session_transcripts |
| chunk_id | UUID | FK to the retrieved chunk |
| citation_text | text | The specific text cited |
| relevance | float | Relevance score |

> [!note] Citation Infrastructure Exists
> The table and write path exist. However, since `source_summary` in assessments is optional and free-form, citation records may be sparse or inconsistently populated. The quality of citation data depends entirely on how reliably Claude populates `source_summary` and whether the parsing logic correctly extracts chunk references.

> [!risk] No Citation Completeness Monitoring
> There is no tracking of what percentage of assessments include citations, whether citation rates vary by element or area, or whether cited chunks actually contain the referenced information. Without monitoring, citation quality could silently degrade.

---

## 10. Summary of Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Feedback is ungrounded free-form commentary | High | No enforcement mechanism |
| 2 | No per-area pass/fail criteria | High | `score_by_area` computed but unenforced |
| 3 | Grading denominator is "asked" not "total" | Medium | Allows gaming via early exit |
| 4 | `follow_up_needed` not acted upon by planner | High | Signal computed but discarded |
| 5 | `primary_element` set by Claude, not validated | Medium | Could misattribute attempts |
| 6 | Partial credit (0.7) is arbitrary | Medium | No FAA equivalent |
| 7 | No assessment calibration dataset | Medium | Cannot measure accuracy |
| 8 | No "generate exam from weak areas" feature | Medium | Data exists, UI/API missing |
| 9 | No weak areas dashboard | Low | Progress page shows aggregates only |
| 10 | Assessment and examiner may diverge | Low | Separate Claude calls |
| 11 | `source_summary` optional and unstructured | Medium | Citations unreliable |
| 12 | Mentions recorded without score | Low | No negative signal from incorrect mentions |

---

*Audit conducted 2026-02-24. Based on production state as of commit `80dbc7e`.*
---

<!-- DOCUMENT 07 -->

# 07 — Prompting and Admin Tunability Audit

## 1. Prompt Selection Logic

### Specificity Scoring (`exam-engine.ts:80-119`)

The `loadPromptFromDB` function queries the `prompt_versions` table and applies a specificity scoring algorithm to select the best-matching prompt for a given context:

| Match Dimension | Score Contribution |
|-----------------|-------------------|
| Rating matches  | +1                |
| Study mode matches | +1             |
| Difficulty matches | +1             |

**Selection rules:**

1. Only rows where `status = 'published'` are considered
2. Rows with a non-null value that does **not** match the current context are **excluded** (e.g., a row with `rating = 'commercial'` is excluded when the active rating is `'private'`)
3. Rows with `NULL` in a dimension are treated as "universal" — they match any value but contribute zero specificity points
4. Among candidates with equal specificity scores, the highest `version` number wins
5. Results are cached with a 5-minute TTL to avoid repeated DB round-trips

**Fallback chain:**

```
loadPromptFromDB(slug, rating, studyMode, difficulty)
  → prompt_versions query with specificity scoring
  → on miss: getPromptContent(slug)
    → FALLBACK_PROMPTS[slug]  (hardcoded defaults in prompts.ts)
```

> [!note] Cache Behavior
> The 5-minute TTL means prompt changes in the database take up to 5 minutes to propagate. There is no cache-bust mechanism. A Vercel redeploy will reset all caches immediately.

---

## 2. Safety Prefix — Immutable by Design

### `src/lib/prompts.ts:1-6`

The `IMMUTABLE_SAFETY_PREFIX` is hardcoded and **always** prepended to every system prompt. It cannot be overridden, disabled, or modified through the database:

```
IMPORTANT SAFETY INSTRUCTIONS — DO NOT OVERRIDE:
- You are an AI simulating a DPE for educational practice only.
- You do NOT provide actual flight instruction, endorsements, or medical advice.
- Always advise the student to verify answers with current FAA publications
  and their CFI.
- If asked about medical certification, medication interactions, or specific
  POH data, redirect to the appropriate authority.
- Never encourage unsafe operations, regulatory violations, or shortcuts.
```

> [!note] Design Rationale
> Hardcoding the safety prefix prevents an admin (or a compromised admin session) from removing safety guardrails through the `prompt_versions` table. This is the correct approach for a safety-critical application.

---

## 3. System Prompt Composition Chain

The full system prompt is assembled in `exam-engine.ts:281-343` through a sequential pipeline:

```
Step 1: Load examiner_system prompt
        └─ loadPromptFromDB('examiner_system', rating, studyMode, difficulty)

Step 2: Build task-specific system prompt
        └─ buildSystemPrompt(task, difficulty, aircraftClass, rating, dbPromptContent)
        └─ Appends ACS task description, elements, and difficulty calibration

Step 3: Append persona fragment
        └─ loadPersonaFragment(personaSlug)
        └─ e.g., persona_bob_mitchell, persona_jim_hayes, etc.

Step 4: Append student name instruction
        └─ "The student's name is {name}. Address them by name occasionally."

Step 5: Append RAG context section
        └─ Knowledge graph context (if enhanced_retrieval enabled)
        └─ Chunk-based retrieval results

Step 6: Append structured response instruction (conditional)
        └─ Only if chunked TTS mode is active
        └─ Formats output for paragraph-level streaming

Step 7: Append paragraph structure instruction (conditional)
        └─ Only if non-structured mode AND responding to student answer
        └─ Guides natural paragraph breaks for TTS
```

The safety prefix (`IMMUTABLE_SAFETY_PREFIX`) is prepended **before** step 1's content, ensuring it is always the first thing the model sees.

---

## 4. All 24 Prompt Versions in Production

### `examiner_system` — 10 variants

| Version | Rating | Study Mode | Difficulty | Notes |
|---------|--------|------------|------------|-------|
| 1       | NULL   | NULL       | NULL       | Base examiner prompt (universal fallback) |
| 1       | NULL   | guided     | easy       | Guided mode, easy difficulty |
| 1       | NULL   | guided     | moderate   | Guided mode, moderate difficulty |
| 1       | NULL   | guided     | hard       | Guided mode, hard difficulty |
| 1       | NULL   | freeform   | easy       | Freeform mode, easy difficulty |
| 1       | NULL   | freeform   | moderate   | Freeform mode, moderate difficulty |
| 1       | NULL   | freeform   | hard       | Freeform mode, hard difficulty |
| 1       | NULL   | linear     | easy       | Linear mode, easy difficulty |
| 1       | NULL   | linear     | moderate   | Linear mode, moderate difficulty |
| 1       | NULL   | linear     | hard       | Linear mode, hard difficulty |

### `assessment_system` — 10 variants

| Version | Rating | Study Mode | Difficulty | Notes |
|---------|--------|------------|------------|-------|
| 2       | NULL   | NULL       | NULL       | Base assessment prompt (v2 — latest) |
| 2       | NULL   | linear     | easy       | Draft variant for linear/easy |
| 1       | NULL   | guided     | easy       | Guided mode, easy |
| 1       | NULL   | guided     | moderate   | Guided mode, moderate |
| 1       | NULL   | guided     | hard       | Guided mode, hard |
| 1       | NULL   | freeform   | easy       | Freeform mode, easy |
| 1       | NULL   | freeform   | moderate   | Freeform mode, moderate |
| 1       | NULL   | freeform   | hard       | Freeform mode, hard |
| 1       | NULL   | linear     | moderate   | Linear mode, moderate |
| 1       | NULL   | linear     | hard       | Linear mode, hard |

> [!risk] Version Inconsistency
> The `assessment_system` base prompt is at version 2, but most study-mode variants remain at version 1. The `linear/easy` variant also has a version 2 entry. This creates ambiguity: are the v1 variants stale, or intentionally different? Without a diffing tool, the relationship between these versions is opaque.

### Persona prompts — 4 variants

| Slug | Version | Rating | Notes |
|------|---------|--------|-------|
| `persona_bob_mitchell` | 1 | NULL | Published v1 |
| `persona_jim_hayes` | 1 | NULL | Published v1 |
| `persona_karen_sullivan` | 1 | NULL | Published v1 |
| `persona_maria_torres` | 1 | NULL | Published v1 |

---

## 5. What Admin Can Tune Today

| Tunable | Mechanism | Risk Level |
|---------|-----------|------------|
| `prompt_versions` content | Direct DB `UPDATE` / `INSERT` | High (no validation, no preview) |
| Persona prompts | Direct DB edit on `persona_*` rows | Medium |
| Difficulty-specific prompting | DB rows with `difficulty` column set | Low |
| Study-mode-specific prompting | DB rows with `study_mode` column set | Low |
| System config flags | Direct DB manipulation | High |

### What's NOT Tunable (Hardcoded)

| Component | Location | Reason |
|-----------|----------|--------|
| Safety prefix | `prompts.ts:1-6` | Intentional — safety-critical |
| Structured response format | `exam-engine.ts` composition chain | TTS pipeline dependency |
| Paragraph structure instruction | `exam-engine.ts` composition chain | TTS pipeline dependency |
| RAG section formatting | `exam-engine.ts` composition chain | Retrieval pipeline dependency |
| Assessment JSON schema | `exam-engine.ts` assessment call | Downstream parsing dependency |

> [!note] Appropriate Hardcoding
> The safety prefix and assessment schema **should** remain hardcoded. The structured response and paragraph instructions are tightly coupled to the TTS pipeline and changing them without updating the TTS consumer would break audio streaming. These are reasonable hardcoding decisions.

---

## 6. Identified Gaps

### Gap: No Rating-Specific Prompt Variants

All 24 prompt versions have `rating = NULL`. This means a Private Pilot student and a Commercial Pilot student receive identical examiner tone, complexity expectations, and assessment criteria (aside from what the ACS task itself specifies).

> [!todo] Rating-Specific Prompting
> Create rating-aware variants for at minimum the `examiner_system` base prompt. A Commercial checkride oral is substantially more demanding than a Private — the examiner persona should reflect this. With the existing specificity scoring system, adding `rating = 'commercial'` rows would automatically take precedence for Commercial sessions without affecting Private sessions.

### Gap: No Admin UI for Prompt Management

All prompt editing requires direct SQL against the `prompt_versions` table in the Supabase dashboard. This means:

- **No preview** — cannot see what the assembled prompt looks like before publishing
- **No diff** — cannot compare versions side-by-side
- **No rollback** — must manually revert by changing `status` or `version` fields
- **No audit trail** — Supabase does not log who changed what row and when (unless Postgres audit logging is explicitly enabled)
- **No validation** — a malformed prompt will be served to users immediately (after cache expiry)

> [!risk] Operational Risk
> Direct DB manipulation for prompt editing is acceptable at the current scale (single admin, low traffic), but becomes dangerous as soon as multiple people need to modify prompts or the user base grows. A single bad `UPDATE` could degrade the examiner experience for all active sessions within 5 minutes.

### Gap: Prompt Sprawl Risk

The current 24 rows represent a 3x3 matrix (study_mode x difficulty) for two prompt slugs, plus 4 personas. If rating-specific variants are added (3 ratings), the matrix becomes:

- `examiner_system`: 3 ratings x 3 study modes x 3 difficulties = 27 variants + 1 base = 28
- `assessment_system`: same = 28
- Personas: 4 x 3 ratings = 12 (if rating-specific personas are desired)
- **Total: 68 rows** (up from 24)

Without tooling, managing 68 prompt variants via raw SQL is unsustainable.

---

## 7. Danger Zones

> [!risk] Danger Zone 1: No Prompt Diffing or Rollback UI
> If a prompt change causes degraded examiner behavior, the only recovery path is a manual `UPDATE` statement in the Supabase SQL editor. There is no "undo" button, no version history viewer, and no A/B comparison capability.

> [!risk] Danger Zone 2: Multiple Published Assessment Versions
> The `assessment_system` slug has both v1 and v2 rows in `published` status. The specificity scoring will select v2 for the base case (higher version wins ties), but for `linear/easy` specifically, v2 also exists as a separate row. If both v1 and v2 of `linear/easy` are published, the v2 row wins — but it is unclear whether this is intentional or an oversight from an incomplete migration.

> [!risk] Danger Zone 3: Cache Staleness on Hot Fix
> If a prompt issue is discovered in production, the fix (a DB update) will not take effect for up to 5 minutes due to the TTL cache. During this window, all new sessions will receive the broken prompt. The only way to force immediate propagation is a Vercel redeploy.

> [!risk] Danger Zone 4: No Validation on DB Writes
> There are no database-level constraints on the `content` column of `prompt_versions`. An admin could insert an empty string, a prompt that conflicts with the safety prefix, or content with invalid template variables. All would be served to production without any gate.

---

## 8. Recommendations Summary

| Priority | Item | Effort |
|----------|------|--------|
| P1 | Clarify assessment_system v1/v2 version state — archive or promote | 30 min |
| P2 | Add rating-specific examiner_system variants (at least Commercial) | 2-4 hours |
| P2 | Add `NOT NULL` and `CHECK(length(content) > 50)` constraint on `prompt_versions.content` | 15 min |
| P3 | Build minimal admin prompt editor (view, edit, preview assembled prompt) | 1-2 days |
| P3 | Add `updated_at` and `updated_by` columns to `prompt_versions` for audit trail | 30 min |
| P4 | Implement prompt A/B testing framework | 3-5 days |
---

<!-- DOCUMENT 08 -->

# 08 — Graph and Flow Opportunities Audit

## 1. Current Graph State in Production

### Volume Summary

| Entity | Count | Notes |
|--------|-------|-------|
| **Concepts** | 22,075 | All have embeddings |
| **Relations** | 45,728 | Multiple edge types (is_component_of, LLM-inferred, similarity, CFR cross-ref) |
| **Evidence links** | 30,689 | `concept_chunk_evidence` rows linking concepts to source chunks |

### Concept Type Breakdown

| Type | Count (approximate) | Source |
|------|---------------------|--------|
| `acs_area` | 31 | Migration-seeded (PA, CA, IR areas) |
| `acs_element` | 969 | Migration-seeded (knowledge/risk/skill elements) |
| `topic`, `regulatory_claim`, `definition`, `procedure`, `artifact` | ~21,075 | Extraction scripts run against prod |

> [!note] Full Embedding Coverage
> All 22,075 concepts have embeddings populated. This means vector similarity search across the entire graph is functional — no dead nodes from a partial embedding run.

### Relation Types

The first 1,000 relations captured by snapshot (Supabase default `LIMIT`) were all `is_component_of`, indicating the ACS hierarchy forms the densest cluster. The total of 45,728 edges confirms that additional edge types exist:

- **`is_component_of`** — ACS hierarchy (area -> task -> element)
- **LLM-inferred edges** — Semantic relationships extracted by Claude during knowledge graph population
- **Embedding similarity edges** — Auto-generated from vector proximity
- **CFR cross-reference edges** — Regulatory citation links (14 CFR Part 61, 91, etc.)

### RPC Functions

| RPC | Status | Migration |
|-----|--------|-----------|
| `hybrid_search()` | Active | Pre-existing |
| `get_related_concepts()` | Active | Pre-existing (recursive CTE, depth 3) |
| `get_uncovered_acs_tasks()` | Active | Pre-existing |
| `get_concept_bundle()` | Active | `20260224000003_concept_bundle_rpc.sql` |

The `get_concept_bundle()` RPC performs:
- Outgoing edges + incoming edges at depth 0
- Matches slug prefixes: `acs_element:`, `acs_task:`, `acs_area:`
- Returns a structured bundle suitable for prompt injection

---

## 2. Graph IS Being Used at Runtime

> [!note] Key Finding
> The knowledge graph is **actively integrated** into the production exam engine. This is not a dormant feature.

### Feature Flag State

| Flag | Value | Effect |
|------|-------|--------|
| `graph.enhanced_retrieval` | `ENABLED` | Graph context is prepended to RAG results in examiner prompts |
| `graph.shadow_mode` | `ENABLED` | Redundant — shadow mode is superseded by enhanced mode |

### Examiner Prompt Injection (`exam-engine.ts:281-343`)

When `graph.enhanced_retrieval` is enabled, the system prompt includes:

```
KNOWLEDGE GRAPH CONTEXT:
{graph bundle from get_concept_bundle()}

CHUNK-BASED RETRIEVAL:
{standard RAG chunks from hybrid_search()}
```

The graph context appears **before** chunk-based retrieval, giving it positional priority in the context window.

### Assessment Prompt Injection

Graph context is also injected into the assessment call as a "VERIFIED REGULATORY CLAIMS" section. This provides the assessment model with authoritative regulatory references to compare against the student's answer, improving grading accuracy for regulation-heavy questions.

### Element Code Flow

The element code is passed from the client-side planner state:

```typescript
// api/exam/route.ts:411
const elementCode = clientPlannerState?.queue?.[clientPlannerState?.cursor];
```

This element code drives the `get_concept_bundle()` lookup, ensuring the graph context is relevant to the specific ACS element currently being examined.

---

## 3. GraphRAG Viability Assessment

The existing graph infrastructure opens three high-value opportunities that go beyond traditional chunk-based RAG.

### 3.1 Prerequisite Drill-Down Potential

**Concept:** When a student demonstrates weakness on a topic, the graph can identify prerequisite concepts and guide the examiner to probe foundational knowledge.

**Feasibility with current graph:**
- The `is_component_of` edges already encode the ACS hierarchy (area -> task -> element)
- LLM-inferred edges likely include prerequisite-type relationships
- `get_related_concepts()` with depth 3 traversal can reach prerequisite chains
- Evidence links (30,689 rows) provide source material for each concept

**Example flow:**
```
Student struggles with "Class B airspace requirements"
  → Graph traversal finds prerequisite: "airspace classification system"
  → Examiner: "Let's step back — can you walk me through the different
    airspace classes and their basic characteristics?"
```

> [!todo] Prerequisite Drill-Down Implementation
> Requires: (1) tagging edges with `prerequisite_of` relation type (may already exist in LLM-inferred edges), (2) planner logic to traverse prerequisites when assessment returns `unsatisfactory`, (3) prompt instruction for the examiner to use prerequisite context naturally.

### 3.2 Logical Cross-Topic Transitions

**Concept:** The `examiner_transition` field (if populated on concept or task records) enables the examiner to transition between ACS areas in a way that mirrors a real DPE's conversational flow.

**Feasibility with current graph:**
- Cross-reference edges (CFR links, similarity edges) connect concepts across ACS areas
- A question about "weather minimums for VFR flight" naturally connects to "airspace" via shared regulatory references (14 CFR 91.155)
- The graph can surface these connections to make transitions feel organic rather than random

**Example flow:**
```
Examiner finishes Area I (Preflight Preparation) weather discussion
  → Graph finds shared CFR edge to Area VI (Navigation) weather-related elements
  → Examiner: "You mentioned checking weather along your route. Speaking of
    route planning, how would you handle an unexpected AIRMET along your
    cross-country?"
```

> [!note] Current State
> The existence of an `examiner_transition` field suggests this was anticipated in the schema design. The 45,728 edges provide the connectivity needed. The missing piece is planner-level logic to query transition candidates when selecting the next task.

### 3.3 Regulatory Claim Accuracy Boost

**Concept:** The "VERIFIED REGULATORY CLAIMS" section injected into assessment prompts directly improves grading accuracy for questions involving specific regulations, minimums, or procedural requirements.

**Current state:** This is **already active in production**. The assessment model receives graph-sourced regulatory claims alongside the student's answer, reducing hallucination risk when grading regulation-heavy responses.

**Measurable impact potential:**
- Regulations are binary (correct or incorrect) — ideal for automated accuracy measurement
- Could compare assessment accuracy on regulatory questions with vs. without graph context
- The 30,689 evidence links provide traceable citations back to source material

---

## 4. Staged Adoption Plan

The graph integration has progressed through a phased rollout. Current position: **Stage 2 (Enhanced)**.

### Stage 1: Shadow Mode (Completed)

| Aspect | Status |
|--------|--------|
| Feature flag | `graph.shadow_mode = ENABLED` |
| Behavior | Graph context fetched but results logged, not injected into prompts |
| Purpose | Validate graph retrieval latency and relevance without affecting user experience |
| Outcome | Sufficient to proceed to Enhanced |

> [!risk] Shadow Mode Logging Gap
> Shadow mode is still flagged as `ENABLED` but is superseded by `enhanced_retrieval`. During the shadow phase, the logging did not produce useful comparison data — there is no recorded dataset of "what shadow mode would have retrieved" vs "what chunk-only retrieval produced" that could be used for retroactive analysis. This is a missed observability opportunity.

### Stage 2: Enhanced Retrieval (Current)

| Aspect | Status |
|--------|--------|
| Feature flag | `graph.enhanced_retrieval = ENABLED` |
| Behavior | Graph context prepended to RAG results in both examiner and assessment prompts |
| Purpose | Improve examiner question quality and assessment accuracy with structured knowledge |
| Risks | Graph retrieval adds latency; irrelevant graph context could confuse the model |

### Stage 3: Graph-Guided Flow (Next)

| Aspect | Status |
|--------|--------|
| Feature flag | Not yet created (proposed: `graph.guided_flow`) |
| Behavior | Graph drives task selection, prerequisite drill-down, and cross-topic transitions |
| Purpose | Transform the exam from random task selection to an intelligent, adaptive flow |
| Prerequisites | Planner integration, prerequisite edge tagging, transition candidate scoring |

**Proposed feature flags for Stage 3:**

| Flag | Purpose |
|------|---------|
| `graph.guided_flow` | Master enable for graph-driven task/topic selection |
| `graph.prerequisite_drilldown` | Enable prerequisite traversal on unsatisfactory assessments |
| `graph.cross_topic_transitions` | Enable graph-informed topic transitions |
| `graph.transition_logging` | Log transition decisions for eval (shadow mode for flow) |

---

## 5. Missing Capabilities

### 5.1 No Shadow Mode Comparison Data

> [!risk] Missed Observability
> Shadow mode was enabled but did not produce a structured dataset comparing graph-augmented retrieval vs. chunk-only retrieval. Without this data, it is impossible to quantify the accuracy improvement from Stage 2 (Enhanced). Recommendation: implement a logging mode that records both retrieval paths and their downstream assessment outcomes for a sample of sessions.

### 5.2 No A/B Evaluation Framework

> [!risk] No Accuracy Measurement
> There is no mechanism to compare:
> - Chunk-only RAG assessment accuracy vs. chunk+graph assessment accuracy
> - Graph-guided task selection quality vs. random task selection quality
> - Prerequisite drill-down effectiveness vs. standard re-ask behavior
>
> Without A/B evaluation, the graph investment is justified by intuition rather than data. This is acceptable at the current stage but becomes a blocker before investing in Stage 3.

### 5.3 Shadow Mode Flag Redundancy

The `graph.shadow_mode` flag remains `ENABLED` in production despite being functionally superseded by `graph.enhanced_retrieval`. This creates confusion:

- Does shadow mode logging still run alongside enhanced mode? (Likely yes — wasted compute)
- If enhanced is disabled, does shadow mode re-activate? (Unclear without reading the flag evaluation logic)

> [!todo] Clean Up Shadow Mode
> Either (1) set `graph.shadow_mode = DISABLED` since enhanced supersedes it, or (2) repurpose shadow mode as a parallel logging path that records "what would chunk-only have produced" for A/B comparison.

---

## 6. Recommendations Summary

| Priority | Item | Stage | Effort |
|----------|------|-------|--------|
| P1 | Disable or repurpose `graph.shadow_mode` flag | Current | 15 min |
| P1 | Add latency tracking for graph retrieval vs. chunk retrieval separately | Current | 1-2 hours |
| P2 | Implement A/B logging: record both retrieval paths for a % of sessions | Current | 1-2 days |
| P2 | Tag prerequisite edges in existing graph (may require re-run of extraction) | Stage 3 prep | 1 day |
| P3 | Build planner logic for prerequisite drill-down on unsatisfactory assessment | Stage 3 | 2-3 days |
| P3 | Build transition candidate scoring using cross-reference edges | Stage 3 | 2-3 days |
| P4 | Create graph.guided_flow feature flag and Stage 3 rollout plan | Stage 3 | 1 day |
| P4 | Build eval harness comparing chunk-only vs. chunk+graph accuracy on regulatory questions | Eval | 3-5 days |
---

<!-- DOCUMENT 09 -->

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
---

<!-- DOCUMENT 10 -->

# 10 — Drift vs Existing Documentation

> [!summary]
> Structured comparison of each existing audit document (01 through 10) against the verified production state as of 2026-02-24. Each section identifies stale claims, code drift, and what needs updating.

---

## Methodology

Each existing document was compared against:
- Production database queries (Supabase `pvuiwwqsumoqjepukjhz`)
- Deployed code on `main` branch
- Vercel deployment configuration
- Runtime behavior (latency logs, session data)

Verdict categories:
- **Stale** — Document describes a state that no longer exists
- **Partially stale** — Some claims accurate, others outdated
- **Current** — Document still reflects production reality
- **Superseded** — Document's proposal has been implemented; doc should be marked as historical

---

## 01 — Tech Stack Inventory

| Claim | Doc Value | Actual Value | Verdict |
|-------|-----------|--------------|---------|
| Framework | Next.js 15 | Next.js 16.1.6 | Stale |
| AI Model | Claude Sonnet 3.5 | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Stale |
| Tailwind | v4 | v4 | Current |
| Database | Supabase (PostgreSQL + pgvector) | Same | Current |
| Auth | Supabase Auth (email/password) | Same | Current |
| TTS | OpenAI TTS | Multi-provider (OpenAI/Deepgram/Cartesia) with tiered voice selection | Stale |
| STT | Web Speech API | Same (Chrome-only) | Current |
| Testing | Vitest | Vitest, 235+ tests across 12 files | Partially stale (count outdated) |
| Deployment | Vercel auto-deploy from `main` | Same | Current |

**Action required**: Update framework version, AI model, TTS provider architecture, and test count. Add entries for Deepgram and Cartesia TTS providers. Document the tiered voice selection system.

---

## 02 — Current Architecture Map

| Claim | Actual | Verdict |
|-------|--------|---------|
| Two-file exam engine split (`exam-logic.ts` / `exam-engine.ts`) | Still accurate | Current |
| Two Claude calls per exchange (assess + generate) | Still accurate | Current |
| RAG pipeline: embed query, hybrid search, return top-k chunks | Now includes graph-enhanced retrieval (`enhanced_retrieval=true`) | Partially stale |
| Session management: client-side history only | Still accurate (transcripts table exists but unused) | Current |
| Single rating (Private Pilot) | Three ratings: Private (61), Commercial (60), Instrument (22) | Stale |
| No persona system mentioned | 4 DPE personas with personality prompts now exist | Stale |
| No structured response chunking | 3-chunk JSON for latency-optimized TTS now exists | Stale |

**Action required**: Add GraphRAG retrieval path to architecture diagram. Add multi-rating support. Document persona system and structured response chunking. Update RAG pipeline to show metadata filtering path (code exists, flag not enabled in prod).

---

## 03 — Knowledge Base and Retrieval Pipeline

| Claim | Actual | Verdict |
|-------|--------|---------|
| ~7,000 chunks ingested | 4,674 chunks | Stale (overcounted) |
| RPC function `chunk_hybrid_search` | `hybrid_search` (renamed or doc was wrong) | Stale |
| Risk 6: "Empty Knowledge Graph" | Graph populated: 22K concepts, 45K relations, 30K evidence links | Stale (risk resolved) |
| Embedding model: OpenAI `text-embedding-3-small` | Same | Current |
| Vector dimensions: 1536 | Same | Current |
| `page_start` tracking for citations | `page_start=0` for all 4,674 chunks (not populated) | Partially stale |
| Embedding cache for query reuse | Cache exists but `cache_reused=0` (broken writes) | Stale |
| Metadata filtering not mentioned | Code exists in `rag-filters.ts` and `rag-search-with-fallback.ts`, flag not set in prod | Missing from doc |

**Action required**: Correct chunk count to 4,674. Remove or resolve Risk 6 (graph is populated). Document the metadata filtering pipeline. Note embedding cache bug. Correct RPC function name. Flag `page_start` data gap.

---

## 04 — Exam Flow Engine

| Claim | Actual | Verdict |
|-------|--------|---------|
| Task-level scheduling (pick random task from uncovered list) | Element-level scheduling via planner system | Stale |
| ACS areas: 9 of 12 (exclude IV, V, X) | Same filtering logic | Current |
| Single rating (Private Pilot, 61 tasks) | Three ratings: PA (61), CA (60), IR (22) | Stale |
| No question budget | Still no question budget | Current (but noted as gap) |
| No follow-up probe limit | Still no probe limit | Current (but noted as gap) |
| Session enforcement not mentioned | One-active-exam policy now exists (`session-policy.ts`) | Missing from doc |

**Action required**: Rewrite scheduling section to reflect element-level planner. Add multi-rating support documentation. Document session enforcement policy. Note question budget and probe limit as design gaps.

---

## 05 — Latency Audit and Instrumentation Plan

| Claim | Actual | Verdict |
|-------|--------|---------|
| Status: "plan" (instrumentation not yet active) | Active in production, 83 logs recorded | Stale |
| Target latencies proposed but unmeasured | `latency_logs` table populated via `src/lib/timing.ts` | Stale |
| No streaming mentioned | Structured response chunking (3-chunk JSON) for TTS latency optimization | Stale |
| `exchange.total` span proposed | Exists but always `null` (timing.end never called for streaming path) | Partially stale |

**Action required**: Mark instrumentation as deployed. Update with actual measured latencies from the 83 production logs. Document the `exchange.total` bug. Add structured chunking to the latency pipeline description.

---

## 06 — GraphRAG Proposal for Oral Exam Flow

| Claim | Actual | Verdict |
|-------|--------|---------|
| Status: "proposed" | Implemented and enabled in production | Superseded |
| Knowledge graph: empty, needs population | 22K concepts, 45K relations, 30K evidence links | Superseded |
| Graph traversal via `get_related_concepts()` RPC | RPC exists and is called at runtime | Superseded (now fact) |
| `enhanced_retrieval` flag proposed | Set to `true` in production `system_config` | Superseded (now fact) |
| Admin visualization: not mentioned | 4-tab admin graph visualization interface exists | Missing from doc |

**Action required**: Mark this document as **historical/implemented**. Add a header noting that the proposal was executed. Reference the admin visualization. Cross-link to updated architecture in [[02 - Current Architecture Map]].

---

## 07 — Optimization Roadmap

| Item | Claimed Status | Actual Status | Verdict |
|------|---------------|---------------|---------|
| Embedding cache | Planned | Implemented but broken (`cache_reused=0`) | Partially stale |
| Metadata filtering | Planned | Code complete, flag not set in prod | Partially stale |
| Graph-enhanced retrieval | Planned | Deployed, enabled | Stale (completed) |
| Structured TTS chunking | Not mentioned | Implemented (3-chunk JSON) | Missing |
| Multi-provider TTS | Not mentioned | Implemented (OpenAI/Deepgram/Cartesia) | Missing |
| Persona system | Not mentioned | Implemented (4 DPE personas) | Missing |
| Element-level planner | Not mentioned | Implemented | Missing |

**Action required**: Update completion status for each item. Add newly implemented optimizations that were not on the original roadmap. Mark completed items. Add new items for the remaining gaps (embedding cache fix, metadata filter enablement, exchange.total timing fix).

---

## 08 — PAL MCP Research Log

| Claim | Actual | Verdict |
|-------|--------|---------|
| Research notes on PAL MCP integration | Reference material, no production impact | Current |

**Action required**: None. This is reference material and does not drift with production changes.

---

## 09 — Staging Verification

| Claim | Actual | Verdict |
|-------|--------|---------|
| Staging verification procedures | Staging environment exists | Current |

**Action required**: Minor updates if staging URLs or procedures have changed. Low priority.

---

## 10 — Staging Environment and Safe Deployment

| Claim | Actual | Verdict |
|-------|--------|---------|
| Staging deployment procedures | Staging environment operational | Current |

**Action required**: Verify deployment procedures still match current Vercel configuration. Low priority.

---

## Summary: Drift Severity

| Doc | Drift Level | Priority to Update |
|-----|------------|-------------------|
| [[01 - Tech Stack Inventory]] | High | P1 — version numbers wrong |
| [[02 - Current Architecture Map]] | High | P1 — missing GraphRAG, multi-rating, personas |
| [[03 - Knowledge Base and Retrieval Pipeline]] | High | P1 — chunk count wrong, risks resolved |
| [[04 - Exam Flow Engine]] | High | P1 — scheduling model changed entirely |
| [[05 - Latency Audit and Instrumentation Plan]] | Medium | P2 — status changed from plan to active |
| [[06 - GraphRAG Proposal for Oral Exam Flow]] | Superseded | P2 — mark as historical |
| [[07 - Optimization Roadmap]] | Medium | P2 — many items completed |
| [[08 - PAL MCP Research Log]] | None | No action |
| [[09 - Staging Verification]] | Low | P3 |
| [[10 - Staging Environment and Safe Deployment]] | Low | P3 |

> [!warning] Documentation Debt
> Four of the ten documents (01, 02, 03, 04) have high drift and should be updated before onboarding any new contributor or conducting external review. The system has evolved significantly since these documents were written.
---

<!-- DOCUMENT 11 -->

# 11 — Recommendations and Next Tasks

> [!summary]
> Prioritized action items derived from the production audit. Organized by impact category: knowledge correctness first (user trust), exam realism second (product quality), latency third (only if blocking UX). Each item includes definition of done, code touchpoints, rollback strategy, and testing requirements.

---

## Priority Framework

| Priority | Category | Rationale |
|----------|----------|-----------|
| **P1** | Knowledge Correctness / Grounding | Wrong answers destroy trust. RAG quality is the product. |
| **P2** | Exam Flow Realism | Realistic exam simulation is the value proposition. |
| **P3** | Latency | Only matters if it degrades UX below acceptable thresholds. |
| **Defer** | Safe to defer | Nice-to-have or low-impact items. |

---

## Stop-the-Line Blockers

> [!danger] These issues should be addressed before any new feature work.

1. **Embedding cache writes are broken** (P1.1) — every query re-embeds, wasting OpenAI costs and adding ~300ms latency per query. `cache_reused=0` across all production usage.
2. **All chunks have `page_start=0`** (P1.2) — citations cannot include page numbers, reducing grounding verifiability for users studying from FAA publications.

---

## P1: Knowledge Correctness / Grounding

### P1.1 — Fix Embedding Cache Writes

**Goal**: Embedding cache actually caches. After fix, repeated queries reuse cached embeddings instead of re-calling OpenAI.

**Definition of done**: Run the same exam query twice; second query shows `cache_reused=true` in logs. `SELECT COUNT(*) FROM embedding_cache` increases after exam usage.

**Code touchpoints**:
- `src/lib/rag-retrieval.ts` lines 80-91 — the non-blocking upsert that writes to `embedding_cache`
- Likely issue: silent failure in the upsert (Supabase RLS blocking the write, or the async fire-and-forget swallowing errors)

**DB migrations**: None needed. Table exists.

**Feature flag**: None (this is a bug fix, not a feature toggle).

**Tests to add**:
- Integration test: call embedding retrieval twice with same query, assert cache hit on second call
- Unit test: mock Supabase client, verify upsert is called with correct payload

**Rollback**: No rollback needed. If the fix introduces issues, revert the commit. Cache is additive (reads fall through to OpenAI on miss).

**Staging first**: Yes. Run 5 exam queries on staging, verify `embedding_cache` row count increases.

---

### P1.2 — Re-ingest Chunks with Page Tracking

**Goal**: All 4,674 source chunks have accurate `page_start` and `page_end` values populated from the original PDF sources.

**Definition of done**: `SELECT COUNT(*) FROM source_chunks WHERE page_start IS NULL OR page_start = 0` returns 0.

**Code touchpoints**:
- `scripts/ingest-sources.ts` — the ingestion script that processes PDF sources
- `scripts/extract-images/` — related extraction tooling
- Source PDFs: PHAK, AIM, CFR Part 61/91, FAA-S-ACS documents

**DB migrations**: None needed. Columns exist.

**Feature flag**: None.

**Tests to add**:
- Post-ingest validation query: assert no rows with `page_start = 0` or `NULL`
- Spot-check 10 chunks against source PDFs to verify page numbers are correct

**Rollback**: Re-run ingestion. The script is idempotent by `content_hash` — re-ingesting overwrites existing rows.

**Execution**:
```bash
npx tsx scripts/ingest-sources.ts --subset all
```

**Staging first**: Yes. Ingest on staging, verify page numbers, then run on prod.

---

### P1.3 — Enable Metadata Filtering in Production

**Goal**: RAG queries for specific FAA sources (e.g., "What does 14 CFR 61.113 say?") use metadata filters to narrow the search space, improving precision.

**Definition of done**: Queries mentioning specific CFR sections, PHAK chapters, or AIM sections return chunks from the correct source document with higher ranking.

**Code touchpoints**:
- `src/lib/rag-search-with-fallback.ts` — reads the `rag.metadata_filter` flag from `system_config`
- `src/lib/rag-filters.ts` — 32 unit tests covering filter inference logic
- `src/lib/__tests__/rag-filters.test.ts` — existing test coverage

**DB migration (staging first)**:
```sql
INSERT INTO system_config (key, value)
VALUES ('rag.metadata_filter', '{"enabled": true}')
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}';
```

**Feature flag**: `rag.metadata_filter` in `system_config` table.
- Enable: `UPDATE system_config SET value='{"enabled": true}' WHERE key='rag.metadata_filter';`
- Disable: `UPDATE system_config SET value='{"enabled": false}' WHERE key='rag.metadata_filter';`

**Tests to add**:
- E2E test: ask a question referencing "14 CFR 91.205" and verify returned chunks are from CFR source
- Regression test: ask a general question (no source reference) and verify no filter is applied (fallback behavior preserved)

**Rollback**: Set flag to `false` (see above). Instant, no deployment needed.

**Staging first**: Yes. Enable on staging, run 10 exam queries with source-specific references, compare retrieval quality against baseline.

---

### P1.4 — Add Grounding Instruction to Examiner Prompt

**Goal**: The DPE examiner persona consistently cites FAA source material (regulation numbers, PHAK chapters, AIM sections) when asking questions and providing feedback.

**Definition of done**: Spot-check 10 examiner turns across different ACS areas. At least 8/10 include a specific FAA reference when discussing regulatory or procedural content.

**Code touchpoints**:
- `prompt_versions` table in Supabase — the active system prompt for the examiner
- No code changes needed; this is a prompt content update

**DB migration (staging first)**:
```sql
-- Add grounding instruction to the active examiner prompt
-- Exact wording to append to the system prompt:
-- "Always base your questions on the provided FAA source material.
--  When referencing a regulation, standard, or procedure, cite the
--  specific source (e.g., '14 CFR 91.205', 'PHAK Chapter 5',
--  'AIM 4-3-2'). If the source material does not cover the topic,
--  say so rather than fabricating a reference."
```

**Feature flag**: None. Prompt versioning in `prompt_versions` table provides rollback capability.

**Tests to add**:
- Manual eval: 10 examiner turns, score citation quality (0-2 scale: 0=no citation, 1=vague reference, 2=specific citation)
- Target: mean score >= 1.5

**Rollback**: Revert to previous prompt version in `prompt_versions` table.

**Staging first**: Yes. Update prompt on staging, run 5 exam sessions, evaluate citation quality before promoting to prod.

---

## P2: Exam Flow Realism

### P2.5 — Add Question Budget

**Goal**: Each exam session has a predetermined number of questions (default 20, configurable at session start). The exam ends naturally when the budget is exhausted, simulating real checkride time constraints.

**Definition of done**: A session started with `question_budget=20` ends automatically after 20 exchanges. The user sees a summary screen. The budget is visible in the session config.

**Code touchpoints**:
- `src/types/database.ts` — add `question_budget` to `SessionConfig` interface
- `src/lib/exam-logic.ts` — add budget check to `pickNextElement()` or the element queue consumer
- `src/app/api/exam/route.ts` — check budget before advancing to next question; return `sessionComplete` when exhausted
- `src/app/(dashboard)/practice/page.tsx` — display remaining question count (optional, nice-to-have)

**DB migrations**:
```sql
-- Add question_budget column to exam_sessions (nullable, default 20)
ALTER TABLE exam_sessions
ADD COLUMN question_budget INTEGER DEFAULT 20;
```

**Feature flag**: None. Config-driven via `question_budget` column. Default 20. `NULL` means unlimited (backward compatible).

**Tests to add**:
- Unit test: `pickNextElement()` returns `null` when exchange count >= budget
- Integration test: start session with `question_budget=5`, submit 5 answers, verify session completes
- Edge case: budget of 0 (should immediately complete), budget of 1

**Rollback**: Set `question_budget = NULL` for new sessions (reverts to unlimited). No code rollback needed if the check is `if (budget && count >= budget)`.

---

### P2.6 — Add Follow-up Probe Limit

**Goal**: When a student gives an unsatisfactory answer, the examiner probes up to 2 more times on the same element before moving on. This prevents infinite loops on weak areas and matches real DPE behavior (examiners don't drill the same question forever).

**Definition of done**: After 2 consecutive unsatisfactory follow-ups on the same element, the examiner moves to the next element. The element is marked as unsatisfactory in the session record.

**Code touchpoints**:
- `src/lib/exam-logic.ts` — track `consecutive_unsatisfactory_count` per element; add `MAX_PROBES = 2` constant
- `src/app/api/exam/route.ts` — after assessment, check probe count before deciding whether to follow up or advance

**DB migrations**: None. Probe count is ephemeral (lives in session state, not persisted).

**Feature flag**: None. Constant `MAX_PROBES` in `exam-logic.ts`.

**Tests to add**:
- Unit test: simulate 3 consecutive unsatisfactory answers on same element, verify element advances after 2 probes
- Unit test: satisfactory answer resets probe counter
- Unit test: partial answer counts as a probe attempt

**Rollback**: Set `MAX_PROBES` to a very high number (e.g., 999) to effectively disable.

---

### P2.7 — Logically Connected Cross-ACS Mode

**Goal**: Instead of random element selection, use knowledge graph edges (`leads_to_discussion_of`, `requires_knowledge_of`) to order elements in a way that mimics how a real DPE naturally transitions between topics.

**Definition of done**: When `cross_acs` mode is enabled, element ordering follows graph edges. A session transcript shows logical topic flow (e.g., weather -> flight planning -> performance, not weather -> regulations -> weather).

**Code touchpoints**:
- `src/lib/exam-logic.ts` — new `buildGraphOrderedQueue()` function that uses `concept_relations` edges to create a traversal order
- Depends on: `concept_relations` table having sufficient `leads_to_discussion_of` and `requires_knowledge_of` edges between ACS elements

**DB migrations**: None (uses existing `concept_relations` table).

**Feature flag**: Could be gated by a session config option (`ordering: 'random' | 'graph'`). Default `random` for safety.

**Tests to add**:
- Unit test: given a mock graph with known edges, verify `buildGraphOrderedQueue()` produces a connected traversal
- Integration test: start a graph-ordered session, verify consecutive elements share a graph edge
- Fallback test: if graph has no edges for a given element, fall back to random selection

**Rollback**: Set ordering config to `random`.

**Depends on**: Quality of graph edges. Audit `concept_relations` for `leads_to_discussion_of` edge coverage before implementing.

---

## P3: Latency (Only If Blocking UX)

### P3.8 — Fix `exchange.total` Timing Span

**Goal**: The `exchange.total` latency span records the full round-trip time from student answer submission to examiner response completion. Currently `null` in all 83 production logs.

**Definition of done**: New latency log entries have non-null `exchange.total` values. Median total exchange time is measurable.

**Code touchpoints**:
- `src/app/api/exam/route.ts` approximately line 525 — the streaming response path does not call `timing.end('exchange.total')` before the stream closes
- `src/lib/timing.ts` — the timing utility itself is correct; the issue is in the call site

**DB migrations**: None.

**Feature flag**: None (bug fix).

**Tests to add**:
- Integration test: submit an answer via the exam API, verify the latency log entry has a non-null `exchange.total`
- Verify: `SELECT COUNT(*) FROM latency_logs WHERE spans->>'exchange.total' IS NOT NULL` increases after fix

**Rollback**: Revert commit. No data impact (latency logs are append-only).

---

### P3.9 — Evaluate Graph Retrieval Latency Impact

**Goal**: Quantify the latency added by `graph.enhanced_retrieval` (the additional RPC call to `get_related_concepts()`). Determine if it needs optimization.

**Definition of done**: Report showing p50/p95 latency for `rag.graph.bundle` span across 50+ exchanges. Decision documented: acceptable, needs caching, or needs async prefetch.

**Code touchpoints**:
- Latency logs: `SELECT spans->>'rag.graph.bundle' FROM latency_logs WHERE spans->>'rag.graph.bundle' IS NOT NULL`
- `src/lib/rag-retrieval.ts` — the graph retrieval call site

**DB migrations**: None.

**Feature flag**: `graph.enhanced_retrieval` in `system_config` (already exists, set to `true`).

**Tests to add**: None (this is a measurement task, not a code change).

**Rollback**: If latency is unacceptable, set `graph.enhanced_retrieval` to `false` in `system_config`.

---

## Safe to Defer

> [!info] These items are genuine improvements but do not block core product quality. Implement when bandwidth allows or when they become prerequisites for other work.

| Item | Rationale for Deferral |
|------|----------------------|
| **Rating-specific prompt tuning** | Private/commercial/instrument exams have different depth expectations, but the current generic prompt produces acceptable results for all three. Tune when user feedback indicates depth mismatch. |
| **Admin UI for prompt editing** | Prompts are managed via DB. Admin UI is a developer convenience, not a user-facing need. |
| **Error tracking service integration** | Vercel logs and Supabase logs provide sufficient visibility for current scale. Add Sentry/similar when user count exceeds manual debugging capacity. |
| **Session cleanup automation** | Abandoned sessions (`in_progress` for >24h) accumulate but do not impact active users. Add a cron job when table size becomes a concern. |
| **Monolithic `practice/page.tsx` refactor** | The main exam page is large but functional. Refactor when adding significant new UI features to the practice page. |
| **Transcript persistence** | `session_transcripts` table exists but is not written to. Enable when building features that need historical transcript access (e.g., review mode, spaced repetition). |
| **Admin graph visualization improvements** | 4-tab interface exists and is functional. Polish when graph management becomes a regular workflow. |

---

## Implementation Sequence

> [!tip] Recommended order of execution

```
Week 1:  P1.1 (embedding cache fix) + P1.3 (enable metadata filter)
         Both are low-risk, high-impact, no code deployment needed for P1.3

Week 2:  P1.2 (re-ingest with page tracking)
         Requires script run and validation

Week 3:  P1.4 (grounding instruction) + P3.8 (exchange.total fix)
         Prompt update + small code fix

Week 4:  P2.5 (question budget) + P2.6 (probe limit)
         Both modify exam-logic.ts, can be developed together

Later:   P2.7 (graph-ordered elements) — depends on edge quality audit
         P3.9 (graph latency evaluation) — measurement only, do anytime
```

---

## Cross-References

- [[10 - Drift vs Existing Docs]] — identifies which existing docs need updating based on these findings
- [[02 - Deployed Reality Snapshot]] — production state data underlying these recommendations
- [[01 - Requirements and Non-Negotiables]] — constraints that these recommendations must respect
