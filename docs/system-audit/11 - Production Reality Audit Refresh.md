---
title: "Production Reality Audit Refresh"
date: 2026-02-25
type: system-audit
tags: [heydpe, production, audit, rag, exam-flow, grading, prompts]
status: active
evidence_level: high
---

# 11 — Production Reality Audit Refresh

**Conducted:** 2026-02-25
**Environment:** Production (`pvuiwwqsumoqjepukjhz`, `app.environment = production`)
**Scope:** RAG grounding, exam flow, grading, prompting, knowledge graph — reality vs documentation

---

## Current Production State

### Feature Flags (from `system_config`)

| Flag | Value | Effect |
|------|-------|--------|
| `graph.enhanced_retrieval` | `enabled: true` | Graph concept bundle merged into RAG context |
| `graph.shadow_mode` | `enabled: true` | Graph retrieval logged in parallel |
| `rag.metadata_filter` | *(not set)* | Metadata-aware filtering code ready but not enabled |
| All kill switches | `enabled: false` | All API providers active |
| Maintenance mode | `enabled: false` | System operational |

> [!risk] Both `graph.enhanced_retrieval` and `graph.shadow_mode` are enabled simultaneously.
> Shadow mode is designed for A/B testing without affecting output. When both are on, shadow mode logging runs but has no effect since enhanced retrieval already injects graph context. This is harmless but wasteful — consider disabling shadow mode now that enhanced retrieval is proven.

### Database Scale

| Table | Count | Notes |
|-------|-------|-------|
| concepts | 22,084 | 8,417 regulatory_claims, 5,001 topics, 3,350 procedures, 2,850 definitions |
| concept_relations | 49,351 | 26K applies_in_scenario, 20K leads_to_discussion_of, 3K is_component_of |
| concept_chunk_evidence | 30,689 | 98.64% of concepts have evidence |
| source_documents | 172 | PDFs ingested from FAA library |
| source_chunks | 4,674 | 4,624 with embeddings |
| acs_tasks | 143 | PA:61, CA:60, IR:22 |
| acs_elements | 2,174 | K/R/S elements across all ratings |
| exam_sessions | 70 | 14 completed, 21 active |
| session_transcripts | 720 | Full Q&A history |
| prompt_versions | 24 | Versioned examiner/assessment prompts |

---

## RAG Grounding Path

### How chunks are retrieved

1. **Query construction** (`src/lib/exam-engine.ts:199`):
   ```
   query = task.task + recentHistory + studentAnswer (max 500 chars)
   ```

2. **Embedding generation** (`src/lib/rag-retrieval.ts:45`):
   - OpenAI `text-embedding-3-small` (1536-dim)
   - DB-backed `embedding_cache` lookup first (SHA-256 of normalized query)
   - Cache reuse rate: **0** (broken — `chunks_with_page_start = 0` in snapshot, possibly stale cache entries)

3. **Hybrid search** (`src/lib/rag-retrieval.ts` → `chunk_hybrid_search` RPC):
   - Vector similarity (pgvector cosine distance) + full-text search (tsvector)
   - Default: 5 chunks returned
   - Weight split: 0.65 vector / 0.35 FTS (not empirically validated)

4. **Metadata-aware fallback** (`src/lib/rag-search-with-fallback.ts`):
   - Code ready but **not enabled** (`rag.metadata_filter` flag not set)
   - When enabled: `inferRagFilters()` extracts CFR refs, document types from context
   - Two-pass: filtered search first, unfiltered fallback if < 2 results

5. **Graph bundle injection** (`src/lib/exam-engine.ts:207-258`):
   - When `graph.enhanced_retrieval` is enabled AND `elementCode` is provided
   - Calls `fetchConceptBundle(elementCode)` → `get_concept_bundle` RPC
   - Recursive CTE traverses outgoing edges (all depths) + incoming edges (depth 0)
   - Formats as: `KNOWLEDGE GRAPH CONTEXT:\n{bundle}\n\nCHUNK-BASED RETRIEVAL:\n{chunks}`
   - Graph context prepended to chunk context in system prompt

### Where citations come from

- **Evidence chunks**: `concept_chunk_evidence` table links concepts to `source_chunks`
- **In graph bundle**: Each concept returns up to 3 evidence chunks (ordered by confidence)
- **In RAG context**: `formatChunksForPrompt()` includes doc_title, heading, page range
- **In assessment**: `source_summary` field asks Claude to cite specific CFR/document refs

> [!risk] Citation accuracy depends on Claude correctly reproducing references from context.
> There is no post-hoc verification that cited CFR sections actually exist in the source material. The `regulatory_claim` concepts provide verified facts, but Claude can still hallucinate when synthesizing answers.

---

## Exam Flow: How Elements Are Selected

### Session configuration (`src/app/(dashboard)/practice/page.tsx`)

User selects: rating, aircraft class, study mode (linear/cross_acs/weak_areas), difficulty, areas, persona.

### Element queue building (`src/lib/exam-logic.ts:buildElementQueue`)

1. Filter elements by selected areas + aircraft class + rating
2. **Linear mode**: Queue all elements in ACS order (I.A.K1, I.A.K2, ... II.A.K1, ...)
3. **Cross-ACS mode**: Group by area, select 2-3 random elements per area, interleave
4. **Weak areas mode**: Prioritize elements with prior unsatisfactory/partial scores

### Element-level scheduling (`src/lib/exam-logic.ts:selectNextElement`)

1. Pop next element from queue (PlannerState cursor)
2. If element already attempted 3+ times and satisfactory → skip
3. If all queued elements exhausted → exam complete

### How difficulty is applied

- Prompt templates vary by difficulty (easy/medium/hard/mixed)
- DB-backed `prompt_versions` table with specificity scoring: `+1` for matching rating, `+1` for study_mode, `+1` for difficulty
- Mixed difficulty: prompt instructs Claude to vary naturally

> [!risk] No adaptive difficulty adjustment within a session.
> If a student consistently fails, difficulty doesn't decrease. If they consistently pass, difficulty doesn't increase. The cursor just moves forward. Future improvement: track running score and inject difficulty adjustment hints into the prompt.

---

## Grading and Feedback

### Assessment pipeline (`src/lib/exam-engine.ts:assessAnswer`)

Each student answer triggers:
1. **RAG context fetch** (shared with examiner generation)
2. **Assessment Claude call** with:
   - All ACS elements for the current task
   - Recent conversation context (last 4 exchanges)
   - FAA source material (chunk retrieval)
   - Verified regulatory claims (from graph bundle)
   - Image context (if question included images)
3. **JSON response** parsed: `score`, `feedback`, `misconceptions`, `follow_up_needed`, `primary_element`, `mentioned_elements`, `source_summary`

### Where outcomes are stored

| Table | What | Written by |
|-------|------|-----------|
| `session_transcripts` | Full Q&A text per exchange | `src/app/api/exam/route.ts` (after() block) |
| `element_attempts` | Element-level scores (primary + mentioned) | `src/app/api/exam/route.ts` (after() block) |
| `transcript_citations` | Chunk IDs used for each transcript entry | `src/app/api/exam/route.ts` (after() block) |
| `exam_sessions.acs_tasks_covered` | Task-level coverage JSONB | Updated on `next-task` action |
| `exam_sessions.weak_areas` | Concept-level weak areas | Updated on session completion |
| `exam_sessions.result` | Final grade + score breakdown | `computeExamResult()` on completion |

### What feedback is shown to students

- **During exam**: Assessment feedback text + misconception list (real-time via SSE)
- **After exam**: Score breakdown by area, grade (satisfactory/unsatisfactory/incomplete)
- **Progress page**: Session history, element-level scores, weak area identification

> [!todo] Missing: Targeted study recommendations based on weak areas.
> The `weak_areas` JSONB and `element_attempts` data exist, but there's no UI that says "You consistently miss weather minimums — review 14 CFR 91.155." This is a high-value feature gap.

---

## Prompting and Tunability

### Prompt architecture

1. **Base prompt**: `buildSystemPrompt()` in `src/lib/exam-logic.ts` — builds DPE persona with task context
2. **DB overlay**: `loadPromptFromDB()` fetches from `prompt_versions` table with specificity scoring
3. **Persona fragment**: `loadPersonaFragment()` appends personality traits from `persona_{id}` prompt key
4. **RAG injection**: FAA source material appended to system prompt
5. **Graph injection**: Knowledge graph bundle prepended to RAG section
6. **Structured response**: Optional JSON output mode for chunked TTS streaming

### What admins can tune today (DB-only, no code changes)

| What | How | Table |
|------|-----|-------|
| Examiner persona/tone | Edit `prompt_versions` where `prompt_key = 'examiner_system'` | `prompt_versions` |
| Assessment criteria | Edit `prompt_versions` where `prompt_key = 'assessment_system'` | `prompt_versions` |
| DPE personas | Edit `prompt_versions` where `prompt_key = 'persona_{id}'` | `prompt_versions` |
| Difficulty variants | Create rows with matching `difficulty` column | `prompt_versions` |
| Rating/mode variants | Create rows with matching `rating`/`study_mode` columns | `prompt_versions` |
| Feature flags | Update `system_config` values | `system_config` |
| Voice settings | Update `tts.openai`, `tts.deepgram`, `tts.cartesia` configs | `system_config` |
| Kill switches | Set `kill_switch.{provider}` to `{"enabled": true}` | `system_config` |

### Current prompt versions (24 rows)

Prompt keys include: `examiner_system`, `assessment_system`, `persona_capt_harris`, `persona_dr_chen`, `persona_mike_rodriguez`, `persona_sarah_williams`, difficulty variants per rating.

---

## Staging Deprecation Note

> [!decision] Staging environment is not authoritative for this audit.
> The staging Supabase project (`curpdzczzawpnniaujgq`) has:
> - 2,348 concepts (vs 22,084 in prod)
> - 2,317 relations (vs 49,351 in prod)
> - 0 evidence links (vs 30,689 in prod)
> - `graph.enhanced_retrieval = false`
>
> Staging was useful during initial development but has drifted significantly from production. All graph population scripts were run against production directly (with `ALLOW_PROD_WRITE=1`). For future verification, query production directly or use `npm run audit:snapshot:prod`.

---

## Stop-the-Line Risks

| # | Risk | Severity | Mitigation | Status |
|---|------|----------|-----------|--------|
| 1 | Claude hallucinating CFR numbers | High | Graph bundle injects verified regulatory_claim nodes with exact CFR references | **Mitigated** (graph active) |
| 2 | Assessment scoring inconsistency | Medium | Prompt versioning allows A/B testing; `source_summary` provides audit trail | Monitoring needed |
| 3 | No real-time accuracy monitoring | Medium | `off_graph_mentions` table exists but has 0 rows — pipeline not writing to it | **Open** |
| 4 | Graph bundle too large for some elements | Low | `formatBundleForPrompt()` caps at 15 regulatory claims, 10 misconceptions, 5 transitions | Monitoring needed |
| 5 | Embedding cache not reusing (0 hits) | Low | Cache mechanism exists but `embedding_cache_reused = 0` in snapshot | **Open** — investigate cache key matching |

---

## Prioritized Next Tasks

| # | Task | Priority | Effort | DoD |
|---|------|----------|--------|-----|
| 1 | Enable `rag.metadata_filter` in system_config | P1 | XS | Flag set, filtered search active for CFR queries |
| 2 | Run `infer-edges.ts --strategy llm` for missing edge types | P1 | M | `requires_knowledge_of` > 0, `contrasts_with` > 0 in validation |
| 3 | Fix `off_graph_mentions` pipeline | P2 | S | Mentions written during exam sessions, admin can review |
| 4 | Investigate embedding cache miss rate | P2 | S | Cache hit rate > 0 in next audit snapshot |
| 5 | Add weak area study recommendations UI | P2 | M | Progress page shows targeted study suggestions per weak area |
| 6 | Disable `graph.shadow_mode` (redundant with enhanced_retrieval on) | P3 | XS | Flag set to `{"enabled": false}` |
| 7 | Validate hybrid search weight split (0.65/0.35) | P3 | M | A/B test with regulatory assertion test set |
| 8 | Add adaptive difficulty hints to prompts | P3 | M | Running score tracked, difficulty adjustment suggested mid-session |

---

## Evidence Sources

| Claim | Source |
|-------|--------|
| Production DB counts | `scripts/graph/graph-metrics.ts` run 2026-02-25, `docs/graph-reports/2026-02-25-graph-metrics.json` |
| Feature flags | `SELECT * FROM system_config` via Supabase service role |
| RAG pipeline path | `src/lib/exam-engine.ts:184-274`, `src/lib/rag-retrieval.ts`, `src/lib/rag-search-with-fallback.ts` |
| Exam flow logic | `src/lib/exam-logic.ts:buildElementQueue`, `src/lib/exam-logic.ts:selectNextElement` |
| Grading pipeline | `src/lib/exam-engine.ts:605-767`, `src/app/api/exam/route.ts` |
| Prompt architecture | `src/lib/exam-engine.ts:80-119`, `src/lib/exam-logic.ts:buildSystemPrompt` |
| Graph integration | `src/lib/graph-retrieval.ts`, `supabase/migrations/20260225000001_fix_bundle_rpc_multi_category.sql` |
| Previous audit | `docs/system-audit/00 - Index.md`, `docs/system-audit/production-audit/` |

---

*Last updated: 2026-02-25*
