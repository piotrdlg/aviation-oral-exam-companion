---
title: "Requirements and Non-Negotiables"
date: 2026-02-25
tags: [audit, requirements, product-spec, heydpe]
status: current
evidence_level: high
audit_ref: prod-reality-audit-20260224
---

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
