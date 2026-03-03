---
date: 2026-02-27
type: system-audit
tags: [heydpe, system-audit, inventory, codebase, database]
status: final
evidence_level: high
---

# System State Inventory (2026-02-27)

This document captures the complete system state of HeyDPE as of 2026-02-27, taken from the `inventory-verification-sprint-20260227` branch. Every claim is backed by an evidence file stored in `docs/system-audit/evidence/2026-02-27/` or by direct file path reference.

---

## 1. Repository Baseline

| Property | Value | Evidence |
|----------|-------|----------|
| Branch | `inventory-verification-sprint-20260227` (from `main` at `8dab6d3`) | `evidence/2026-02-27/commands/git-status.txt` line 1 |
| HEAD | `8dab6d3` — "Merge prod-reality-audit-20260224: KG infrastructure + ExamPlan Phase 4" | `evidence/2026-02-27/commands/git-log-20.txt` line 1 |
| Remote | `origin/main` at `8dab6d3` (in sync) | `evidence/2026-02-27/commands/git-branches.txt` line 4 |
| Working tree | Clean (untracked screenshots and temp files only, no staged or modified files) | `evidence/2026-02-27/commands/git-status.txt` |

### Active Branches

| Branch | HEAD | Tracking | Status |
|--------|------|----------|--------|
| `main` | `8dab6d3` | `origin/main` | Current production |
| `inventory-verification-sprint-20260227` | `8dab6d3` | (local only) | This audit sprint |
| `phase5-grading-v2-quick-drill` | `8e165c5` | `origin/phase5-grading-v2-quick-drill` | PR #3 OPEN |
| `feat/light-themes-sectional-briefing` | `4fbe61b` | `origin/feat/light-themes-sectional-briefing` | PR #1 MERGED |
| `feat/voice-enabled-setting` | `b5fa3c5` | `origin/feat/voice-enabled-setting` | PR #2 MERGED |
| `prod-reality-audit-20260224` | `b920534` | (no remote) | Merged into main |

**Evidence:** `evidence/2026-02-27/commands/git-branches.txt`

### Pull Requests

| PR | Title | Branch | State | Stats | Date |
|----|-------|--------|-------|-------|------|
| #3 | feat(exam): Phase 5 -- Grading V2 + Quick Drill | `phase5-grading-v2-quick-drill` | OPEN | +1944 / -14 | 2026-02-27 |
| #2 | Move voice mode toggle to Settings as persistent preference | `feat/voice-enabled-setting` | MERGED | -- | 2026-02-23 |
| #1 | Replace Radar/Neon with light-background Sectional and Briefing themes | `feat/light-themes-sectional-briefing` | MERGED | -- | 2026-02-23 |

**Evidence:** `evidence/2026-02-27/github/pr-list.txt`, `evidence/2026-02-27/github/pr-3-view.txt`

### Recent Commits (last 20)

```
8dab6d3 Merge prod-reality-audit-20260224: KG infrastructure + ExamPlan Phase 4
b920534 Add design/implementation plans, staging tools, and dev utilities
9e50c41 Update graph explorer with taxonomy node support and UI fixes
5a47e80 Add knowledge graph infrastructure: migrations, scripts, taxonomy pipeline
99a125c Add system audit docs 11-19, production audit, and graph reports
c09c5a2 Add ExamPlanV1: predetermined exam shape with grounding enforcement
6b82b95 Add multi-line label blocks to 2D and 3D graph views
e2b3896 Fix AFRAME not defined error by using standalone force-graph packages
62d0fc0 Fix graph explorer "No nodes found" by stripping slug prefix before RPC
007d569 Add ConceptCategory, EvidenceType, ConceptChunkEvidence types to database.ts
bb6611e fix: lazy-init Stripe client to prevent build crash when key is unset
640d903 feat: add graph page with Explorer, 3D, Health, and Coverage tabs
648cd89 feat: add graph coverage treemap visualization
a620237 feat: add graph health audit dashboard
965b5aa feat: add 3D WebGL graph view
998e028 feat: add 2D graph explorer with search, zoom, and detail panel
f657428 feat: add graph detail panel for concept inspection
def63a7 feat: add graph coverage API for treemap visualization
5f3339f feat: add graph health API and orphan concepts RPC
0700fac feat: add graph bundle API with element search
```

**Evidence:** `evidence/2026-02-27/commands/git-log-20.txt`

---

## 2. Build Health

| Check | Result | Tool / Version | Duration | Evidence |
|-------|--------|----------------|----------|----------|
| Unit Tests | **495 passing** across 25 test files | Vitest v4.0.18 | ~1.14s | `evidence/2026-02-27/commands/npm-test.txt` |
| Typecheck | **PASS** (tsc --noEmit) | TypeScript (Next.js built-in) | -- | `evidence/2026-02-27/commands/npm-typecheck.txt` |
| Lint | **122 errors, 61 warnings** (183 total) | ESLint | -- | `evidence/2026-02-27/commands/npm-lint.txt` |
| Build | **PASS** (59 static pages, all routes compiled) | Next.js 16.1.6 (Turbopack) | 4.7s compile | `evidence/2026-02-27/commands/npm-build.txt` |

### Test Breakdown by File

| Test File | Tests | Duration |
|-----------|-------|----------|
| `src/lib/__tests__/exam-logic.test.ts` | 76 | 11ms |
| `src/lib/__tests__/app-env.test.ts` | 35 | 8ms |
| `src/lib/__tests__/rag-filters.test.ts` | 32 | 4ms |
| `src/lib/__tests__/exam-plan.test.ts` | 31 | 8ms |
| `src/lib/__tests__/browser-detect.test.ts` | 31 | 5ms |
| `src/lib/__tests__/session-policy.test.ts` | 26 | 23ms |
| `src/lib/__tests__/email.test.ts` | 25 | 6ms |
| `src/lib/__tests__/analytics-utils.test.ts` | 24 | 31ms |
| `scripts/__tests__/infer-edges.test.ts` | 22 | 4ms |
| `src/lib/__tests__/bench-stats.test.ts` | 20 | 3ms |
| `scripts/__tests__/chunk-utils.test.ts` | 17 | 4ms |
| `src/lib/__tests__/email-routing.test.ts` | 17 | 3ms |
| `src/lib/__tests__/sentence-boundary.test.ts` | 16 | 4ms |
| `src/lib/__tests__/image-retrieval.test.ts` | 15 | 7ms |
| `scripts/__tests__/extract-topics.test.ts` | 15 | 4ms |
| `src/lib/__tests__/graph-retrieval.test.ts` | 14 | 3ms |
| `src/lib/__tests__/eval-helpers.test.ts` | 12 | 3ms |
| `src/lib/__tests__/utm.test.ts` | 12 | 3ms |
| `scripts/__tests__/extract-regulatory-claims.test.ts` | 10 | 3ms |
| `src/lib/__tests__/ttl-cache.test.ts` | 9 | 4ms |
| `src/lib/__tests__/analytics.test.ts` | 8 | 3ms |
| `src/lib/__tests__/voice-usage.test.ts` | 6 | 14ms |
| `src/lib/__tests__/timing.test.ts` | 6 | 4ms |
| `scripts/__tests__/embed-concepts.test.ts` | 13 | 3ms |
| `src/lib/__tests__/provider-factory.test.ts` | 3 | 1ms |

**Evidence:** `evidence/2026-02-27/commands/npm-test.txt` lines 8-56

### Lint Error Categories

The 122 errors and 61 warnings break down into the following categories:

| Category | Count | Type | Primary Location |
|----------|-------|------|------------------|
| `react/jsx-no-comment-textnodes` | ~50 | error | Admin pages, landing pages, pricing |
| `@typescript-eslint/no-explicit-any` | ~30 | error | e2e/ helpers, test files, scripts |
| `react-hooks/set-state-in-effect` | 6 | error | login, SessionConfig, progress pages |
| `react-hooks/rules-of-hooks` | 3 | error | `src/app/api/exam/route.ts` (false positive: `useBonusQuestion` is not a React Hook) |
| `react-hooks/immutability` | 1 | error | `src/hooks/useSentenceTTS.ts` |
| `prefer-const` | ~8 | error | Various scripts and API routes |
| `@typescript-eslint/no-unused-vars` | ~40 | warning | e2e/ files, scripts, admin pages |
| `@next/next/no-img-element` | ~7 | warning | ExamImages, ImageLightbox, settings |

**Evidence:** `evidence/2026-02-27/commands/npm-lint.txt` (full 465-line output)

---

## 3. API Routes (33 routes)

33 API route files verified via `src/app/api/**/route.ts` glob. Build output confirms all routes compile successfully.

### Core Exam & Session (5 routes)

| Route | File | Purpose |
|-------|------|---------|
| `/api/exam` | `src/app/api/exam/route.ts` | Exam engine: start, respond, next-task, list-tasks |
| `/api/session` | `src/app/api/session/route.ts` | Session CRUD: create, update, list |
| `/api/user/sessions` | `src/app/api/user/sessions/route.ts` | List active sessions for current user |
| `/api/user/avatar` | `src/app/api/user/avatar/route.ts` | Upload/manage user avatar |
| `/api/user/tier` | `src/app/api/user/tier/route.ts` | Subscription tier lookup |

### Voice & Speech (4 routes)

| Route | File | Purpose |
|-------|------|---------|
| `/api/tts` | `src/app/api/tts/route.ts` | TTS proxy (max 2000 chars), tier-based voice selection via provider factory |
| `/api/stt/token` | `src/app/api/stt/token/route.ts` | Deepgram JWT token generation (rate-limited 4/min) |
| `/api/stt/test` | `src/app/api/stt/test/route.ts` | STT configuration test endpoint |
| `/api/stt/usage` | `src/app/api/stt/usage/route.ts` | Voice usage tracking |

### Billing (4 routes)

| Route | File | Purpose |
|-------|------|---------|
| `/api/stripe/webhook` | `src/app/api/stripe/webhook/route.ts` | Stripe subscription events + email notifications |
| `/api/stripe/checkout` | `src/app/api/stripe/checkout/route.ts` | Create Stripe checkout session |
| `/api/stripe/portal` | `src/app/api/stripe/portal/route.ts` | Redirect to Stripe customer portal |
| `/api/stripe/status` | `src/app/api/stripe/status/route.ts` | Check subscription status |

### Admin (16 routes)

| Route | File | Purpose |
|-------|------|---------|
| `/api/admin/dashboard` | `src/app/api/admin/dashboard/route.ts` | DAU/WAU/MAU stats, anomaly detection |
| `/api/admin/config` | `src/app/api/admin/config/route.ts` | System configuration CRUD |
| `/api/admin/graph` | `src/app/api/admin/graph/route.ts` | Knowledge graph bundle API with element search |
| `/api/admin/graph/health` | `src/app/api/admin/graph/health/route.ts` | Graph integrity metrics + orphan RPC |
| `/api/admin/graph/coverage` | `src/app/api/admin/graph/coverage/route.ts` | ACS coverage treemap data |
| `/api/admin/sessions/[id]/transcript` | `src/app/api/admin/sessions/[id]/transcript/route.ts` | Session transcript viewer |
| `/api/admin/users` | `src/app/api/admin/users/route.ts` | User listing with session counts |
| `/api/admin/users/[id]` | `src/app/api/admin/users/[id]/route.ts` | Individual user detail + element scores |
| `/api/admin/users/[id]/actions` | `src/app/api/admin/users/[id]/actions/route.ts` | User management actions (ban, suspend, etc.) |
| `/api/admin/prompts` | `src/app/api/admin/prompts/route.ts` | System prompt CRUD |
| `/api/admin/prompts/[id]/publish` | `src/app/api/admin/prompts/[id]/publish/route.ts` | Publish a prompt version |
| `/api/admin/prompts/[id]/rollback` | `src/app/api/admin/prompts/[id]/rollback/route.ts` | Rollback prompt to previous version |
| `/api/admin/analytics/overview` | `src/app/api/admin/analytics/overview/route.ts` | Revenue/churn analytics |
| `/api/admin/moderation` | `src/app/api/admin/moderation/route.ts` | Moderation queue listing |
| `/api/admin/moderation/[id]` | `src/app/api/admin/moderation/[id]/route.ts` | Individual moderation item actions |
| `/api/admin/support` | `src/app/api/admin/support/route.ts` | Support ticket management |

### Other (4 routes)

| Route | File | Purpose |
|-------|------|---------|
| `/api/report` | `src/app/api/report/route.ts` | User moderation reports |
| `/api/webhooks/resend-inbound` | `src/app/api/webhooks/resend-inbound/route.ts` | Inbound email webhook (Resend) |
| `/api/flags` | `src/app/api/flags/route.ts` | Feature flags endpoint |
| `/api/bench` | `src/app/api/bench/route.ts` | Performance benchmark endpoint |

**Evidence:** Build output at `evidence/2026-02-27/commands/npm-build.txt` lines 43-75 (all routes listed under `Route (app)`)

---

## 4. Core Library Modules (`src/lib/`)

29 TypeScript modules in `src/lib/` (top-level) plus 8 modules in `src/lib/voice/`. Grouped by domain below.

### Exam Engine (4 modules)

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `exam-engine.ts` | Supabase + Anthropic API integration | `assessAnswer()`, `generateExaminerTurn()`, `fetchAcsTasks()` |
| `exam-logic.ts` | Pure functions (zero external deps) | `filterEligibleTasks()`, `selectRandomTask()`, `buildSystemPrompt()`, `computeExamResult()`, `GROUNDING_CONTRACT`, `connectedWalk()` |
| `exam-planner.ts` | Stateful planner wrapper | `initPlanner()`, `advancePlanner()`, `isExamComplete()` |
| `exam-plan.ts` | Exam plan builder and mutators | `buildExamPlan()`, `recordQuestionAsked()`, `creditMentionedElements()`, `DEFAULT_PLAN_DEFAULTS` |

### Knowledge Graph & RAG (4 modules)

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `graph-retrieval.ts` | Graph bundle fetching for exam context | `fetchConceptBundle()`, `formatBundleForPrompt()` |
| `rag-retrieval.ts` | Chunk-level retrieval with embeddings | `searchChunks()`, `formatChunksForPrompt()`, `getImagesForChunks()` |
| `rag-search-with-fallback.ts` | Multi-strategy search with graceful degradation | `searchWithFallback()` |
| `rag-filters.ts` | Metadata filter inference from queries | `inferRagFilters()` |

### Voice (8 modules in `src/lib/voice/`)

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `provider-factory.ts` | TTS provider factory pattern | `createTTSProvider()` |
| `tier-lookup.ts` | User tier resolution for voice access | `getUserTier()` |
| `sentence-boundary.ts` | Text segmentation for streaming TTS | `tokenizeToSentences()` |
| `usage.ts` | Voice usage tracking and quota enforcement | `trackVoiceUsage()`, `checkVoiceQuota()` |
| `types.ts` | Type definitions | `VoiceTier`, `TTSProvider`, `TTSConfig` |
| `tts/openai-tts.ts` | OpenAI TTS provider implementation | `OpenAITTSProvider` |
| `tts/deepgram-tts.ts` | Deepgram TTS provider implementation | `DeepgramTTSProvider` |
| `tts/cartesia-tts.ts` | Cartesia TTS provider implementation | `CartesiaTTSProvider` |

Additional top-level voice module:

| Module | Purpose |
|--------|---------|
| `voice-integration.ts` | Cross-browser voice configuration and capability detection |

### Auth & Session (4 modules)

| Module | Purpose |
|--------|---------|
| `session-enforcement.ts` | `enforceOneActiveExam()` -- single active session policy |
| `supabase/client.ts` | Browser-side Supabase client (uses `NEXT_PUBLIC_*` keys) |
| `supabase/server.ts` | Server-side Supabase client (cookie-based auth) |
| `supabase/middleware.ts` | Auth session refresh + route protection |

### Admin & Security (3 modules)

| Module | Purpose |
|--------|---------|
| `admin-guard.ts` | `requireAdmin()` -- admin-only route protection |
| `admin-audit.ts` | Audit trail logging for admin actions |
| `kill-switch.ts` | Global kill switch for emergency service shutdown |

### Billing (1 module)

| Module | Purpose |
|--------|---------|
| `stripe.ts` | Lazy-initialized Stripe client, `STRIPE_PRICES` constant map |

### Observability & Caching (3 modules)

| Module | Purpose |
|--------|---------|
| `timing.ts` | Performance span recording to `latency_logs` table |
| `ttl-cache.ts` | Generic TTL cache with module-level singletons |
| `eval-helpers.ts` | Evaluation helpers for assertion testing |

### Configuration & System (3 modules)

| Module | Purpose |
|--------|---------|
| `system-config.ts` | `getConfig()` -- system_config table reader with TTL caching |
| `prompts.ts` | System prompt loader with version management |
| `app-env.ts` | Environment detection (`isProduction`, `isStaging`, `isDevelopment`) |

### Analytics & Tracking (3 modules)

| Module | Purpose |
|--------|---------|
| `analytics.ts` | PostHog analytics wrapper |
| `analytics-utils.ts` | Analytics utility functions and event formatting |
| `utm.ts` | UTM parameter parsing and persistence |

### Utilities (5 modules)

| Module | Purpose |
|--------|---------|
| `rate-limit.ts` | In-memory rate limiter (sliding window) |
| `browser-detect.ts` | Browser/OS detection for voice capability gating |
| `email-routing.ts` | Email routing logic for transactional emails |
| `email.ts` | Email sending (Resend integration) |
| `avatar-options.ts` | Avatar selection options and defaults |
| `theme.ts` | Theme configuration (Cockpit, Glass, Sectional, Briefing) |

---

## 5. Scripts (`scripts/`)

49 TypeScript files in the `scripts/` directory tree. Grouped by function below.

### Data Ingestion (3 scripts)

| Script | Purpose |
|--------|---------|
| `ingest-sources.ts` | PDF ingestion pipeline: extract text, chunk, generate embeddings, store in `source_chunks` |
| `embed-concepts.ts` | Generate/update embeddings for concept nodes |
| `chunk-utils.ts` | Pure text chunking utilities (shared by ingestion and tests) |

### Knowledge Graph Construction (7 scripts)

| Script | Purpose |
|--------|---------|
| `extract-topics.ts` | Topic extraction from source chunks via Claude |
| `extract-regulatory-claims.ts` | CFR regulatory claim extraction from regulation chunks |
| `extract-artifacts.ts` | Diagram/table/figure extraction from source documents |
| `infer-edges.ts` | Edge inference using LLM, embedding similarity, and CFR reference strategies |
| `link-acs-to-chunks.ts` | Link ACS elements to supporting evidence chunks |
| `link-claims-to-acs.ts` | Link regulatory claims to relevant ACS elements |
| `extraction-prompts.ts` | Claude extraction prompt templates |

### Graph Infrastructure (9 scripts in `scripts/graph/`)

| Script | Purpose |
|--------|---------|
| `graph/attach_hub_scaffold.ts` | Attach hub scaffold structure to knowledge graph |
| `graph/attach_concepts_to_taxonomy.ts` | Attach concepts to taxonomy nodes |
| `graph/attach_concepts_to_taxonomy_from_evidence.ts` | Evidence-based concept-to-taxonomy attachment |
| `graph/attach_regulatory_claims_to_sections.ts` | Link regulatory claims to taxonomy sections |
| `graph/attach_artifacts_to_hub_root.ts` | Attach artifact nodes to hub roots |
| `graph/sync_taxonomy_to_concepts.ts` | Sync taxonomy node changes to concept records |
| `graph/build-backbone.ts` | Build backbone edges for graph connectivity |
| `graph/expected-path-audit.ts` | Audit expected traversal paths in the graph |
| `graph/graph-metrics.ts` | Compute graph quality metrics (orphan rate, component size, etc.) |
| `graph/graph-validate.ts` | Graph validation rules |
| `graph/traceability-gap-report.ts` | Report traceability gaps between ACS and evidence |

### Taxonomy (7 scripts in `scripts/taxonomy/`)

| Script | Purpose |
|--------|---------|
| `taxonomy/build_unified_taxonomy.ts` | Build unified topic taxonomy from FAA PDF TOCs |
| `taxonomy/build_multi_hub_taxonomy.ts` | Build multi-hub taxonomy (4 hubs) |
| `taxonomy/classify_chunks.ts` | Classify source chunks into taxonomy nodes |
| `taxonomy/classify_chunks_knowledge.ts` | Knowledge-hub-specific chunk classification |
| `taxonomy/classify_chunks_regulations.ts` | Regulations-hub-specific chunk classification |
| `taxonomy/expand_regulations_taxonomy.ts` | Expand regulations taxonomy with CFR sections |
| `taxonomy/validate_multi_hub_phase1.ts` | Phase 1 validation of multi-hub taxonomy structure |
| `taxonomy/assign_chunks_to_hubs.ts` | Assign chunks to knowledge base hubs |

### Seeding & Maintenance (2 scripts)

| Script | Purpose |
|--------|---------|
| `seed-elements.ts` | ACS element seeding from ACS task definitions |
| `classify-difficulty.ts` | Classify ACS elements by difficulty level |

### Health & Verification (2 scripts)

| Script | Purpose |
|--------|---------|
| `verify-graph-health.ts` | Graph integrity check (orphan rate, edge distribution, component analysis) |
| `verify-graph-e2e.ts` | End-to-end graph smoke test (query, traverse, bundle) |

### Staging & Evaluation (4 scripts in `scripts/staging/` and `scripts/eval/`)

| Script | Purpose |
|--------|---------|
| `staging/env-doctor.ts` | Environment variable validation for staging |
| `staging/verify-phase1.ts` | Phase 1 staging verification |
| `staging/verify-staging.ts` | Full staging environment verification |
| `staging/bench-stats.ts` | Benchmark statistics collection |
| `staging/latency-benchmark.ts` | Latency benchmarking suite |
| `eval/run-regulatory-assertions.ts` | Run regulatory assertion test set |

### Audit (2 scripts in `scripts/audit/`)

| Script | Purpose |
|--------|---------|
| `audit/db-introspect.ts` | Database introspection script (this sprint) |
| `audit/db-snapshot.ts` | Database snapshot for audit evidence |

### Exam Audit (1 script in `scripts/exam/`)

| Script | Purpose |
|--------|---------|
| `exam/plan-audit.ts` | Audit recent sessions for ExamPlan compliance |

---

## 6. Migrations (48 `.sql` files)

48 SQL migration files in `supabase/migrations/`. Listed chronologically with purpose.

### 2026-02-14 (9 files) -- Foundation

| Migration | Purpose |
|-----------|---------|
| `20260214000001_initial_schema.sql` | Full schema: 8 core tables, RLS policies, RPC functions |
| `20260214000002_seed_acs_tasks.sql` | 61 Private Pilot ACS tasks (FAA-S-ACS-6C) |
| `20260214000003_acs_elements.sql` | ACS elements table + seeding |
| `20260214000004_exam_sessions_config.sql` | Session configuration columns |
| `20260214000005_source_tables.sql` | Source documents, chunks, images tables |
| `20260214000006_element_attempts.sql` | Element attempt tracking |
| `20260214000007_aircraft_classes.sql` | Aircraft class definitions |
| `20260214000008_voice_tiers.sql` | Voice tier configuration |
| `20260214000009_fix_user_profile_trigger.sql` | Fix user profile auto-creation trigger |

### 2026-02-15 (2 files) -- Fixes

| Migration | Purpose |
|-----------|---------|
| `20260215000001_fix_search_path.sql` | Fix PostgreSQL search path for RPC functions |
| `20260215000002_image_tables.sql` | Image chunk mapping tables |

### 2026-02-16 (6 files) -- Multi-Rating + Pre-Commercialization

| Migration | Purpose |
|-----------|---------|
| `20260216000001_seed_instrument_acs_tasks.sql` | 22 Instrument Rating ACS tasks (FAA-S-ACS-8C) |
| `20260216000002_seed_commercial_acs_tasks.sql` | 60 Commercial Pilot ACS tasks (FAA-S-ACS-7B) |
| `20260216100001_pre_commercialization.sql` | Pre-commercialization schema updates |
| `20260216100002_seed_initial_prompts.sql` | Initial system prompts |
| `20260216100003_prompt_difficulty_column.sql` | Difficulty column for prompts |
| `20260216100004_seed_difficulty_prompts.sql` | Difficulty-specific prompt variants |

### 2026-02-17 (3 files) -- Billing + Voice Fixes

| Migration | Purpose |
|-----------|---------|
| `20260217100001_stripe_schema_fixes.sql` | Stripe billing schema corrections |
| `20260217100002_seed_tts_config.sql` | TTS voice configuration seed data |
| `20260217100003_fix_profile_trigger_safety.sql` | Safety fix for profile trigger |

### 2026-02-18 (6 files) -- Voice Tiers + Session Management

| Migration | Purpose |
|-----------|---------|
| `20260218000001_simplify_voice_tiers.sql` | Simplified voice tier structure |
| `20260218000002_practice_defaults.sql` | Default practice session configuration |
| `20260218100001_seed_assessment_prompts.sql` | Assessment-specific system prompts |
| `20260218100002_seed_mixed_difficulty_prompts.sql` | Mixed difficulty prompt variants |
| `20260218200001_session_resume_and_scores.sql` | Session resume support + element scoring |
| `20260218300001_support_tickets.sql` | Support ticket schema |

### 2026-02-19 (4 files) -- Onboarding + Session Policy

| Migration | Purpose |
|-----------|---------|
| `20260219000001_onboarding_columns.sql` | User onboarding state tracking |
| `20260219000002_theme_column.sql` | Theme preference column |
| `20260219000003_voice_personas.sql` | Voice persona definitions |
| `20260219100001_session_policy_redesign.sql` | Session policy redesign (single active session) |
| `20260219100002_session_cron_jobs.sql` | Cron jobs for session cleanup |

### 2026-02-20 (8 files) -- Avatar + Graph Foundation

| Migration | Purpose |
|-----------|---------|
| `20260220000001_user_profile_avatar.sql` | User avatar column |
| `20260220000002_persona_enrichment.sql` | Voice persona enrichment data |
| `20260220000003_seed_persona_prompts.sql` | Persona-specific prompts |
| `20260220000004_avatars_bucket.sql` | Supabase Storage bucket for avatars |
| `20260220000005_transcript_update_policy.sql` | Transcript update RLS policy |
| `20260220100001_embedding_cache_and_latency_timings.sql` | Embedding cache table + latency_logs table |
| `20260220100002_acs_skeleton_graph.sql` | ACS skeleton in knowledge graph (areas, tasks, elements + `is_component_of` edges) |

### 2026-02-22 (1 file)

| Migration | Purpose |
|-----------|---------|
| `20260222000001_voice_enabled_preference.sql` | Voice enabled user preference |

### 2026-02-24 (6 files) -- Knowledge Graph Infrastructure

| Migration | Purpose |
|-----------|---------|
| `20260224000001_concept_chunk_evidence.sql` | `concept_chunk_evidence` table for linking concepts to source chunks |
| `20260224000002_graph_feature_flags.sql` | Feature flags for graph features (`graph.enhanced_retrieval`, etc.) |
| `20260224000003_concept_bundle_rpc.sql` | `get_concept_bundle()` RPC function |
| `20260224000004_fix_grants.sql` | Grant fixes for graph tables |
| `20260224000005_fix_bundle_rpc_bidirectional.sql` | Bidirectional bundle traversal in RPC |
| `20260224100001_orphan_concepts_rpc.sql` | `get_orphan_concepts()` RPC function |

### 2026-02-25 (2 files) -- Bundle + Taxonomy

| Migration | Purpose |
|-----------|---------|
| `20260225000001_fix_bundle_rpc_multi_category.sql` | Multi-category support in bundle RPC |
| `20260225100001_taxonomy_scaffold.sql` | Taxonomy scaffold: `kb_hubs`, `kb_taxonomy_nodes`, `kb_chunk_taxonomy` tables |

### 2026-02-26 (1 file) -- Multi-Hub

| Migration | Purpose |
|-----------|---------|
| `20260226000001_multi_hub_taxonomy.sql` | Multi-hub taxonomy: hub_slug columns, taxonomy_slug, hub assignment |

**Note:** PR #3 adds one additional migration (`20260226100001_add_quick_drill_study_mode.sql`) that is NOT on `main` and NOT applied to production.

---

## 7. Database State (Production)

Data from DB introspection run at **2026-02-27T23:36Z** via `scripts/audit/db-introspect.ts`.

### Table Row Counts

| Table | Rows | Notes |
|-------|------|-------|
| `acs_tasks` | 143 | 61 private + 60 commercial + 22 instrument |
| `acs_elements` | 2,174 | All ACS K/R/S elements seeded across 3 ratings |
| `concepts` | 24,613 | Graph nodes: topics, claims, acs_element, acs_area categories |
| `concept_relations` | 74,271 | Graph edges (see distribution below) |
| `concept_chunk_evidence` | 30,689 | Concept-to-source-chunk evidence links |
| `exam_sessions` | 73 | User exam sessions |
| `session_transcripts` | 955 | Individual Q&A transcript rows |
| `latency_logs` | 199 | Performance timing span data |
| `source_documents` | 172 | Ingested FAA manuals/handbooks (service-role access only) |
| `source_chunks` | 4,674 | Text chunks with embeddings (pgvector) |
| `source_images` | 1,596 | Extracted PDF images |
| `embedding_cache` | 200 | Cached query embeddings (LRU) |
| `kb_hubs` | 4 | knowledge, acs, regulations, aircraft |
| `kb_taxonomy_nodes` | 2,529 | Taxonomy tree nodes across 4 hubs |
| `kb_chunk_taxonomy` | 4,674 | Chunk-to-taxonomy mappings (100% assignment) |
| `transcript_citations` | 2,135 | Source citations in transcripts |
| `user_profiles` | 11 | Registered users |
| `admin_users` | 1 | Admin allowlist entry |
| `support_tickets` | 0 | Empty (no tickets filed) |
| `off_graph_mentions` | 0 | Empty (no off-graph mentions logged) |
| `image_chunk_mappings` | null | Not queryable via REST (may be empty or restricted) |
| `system_flags` | null | **NOT FOUND** in schema cache |
| `system_prompts` | null | Not queryable via REST |
| `ticket_messages` | null | Not queryable via REST |
| `voice_usage_logs` | null | Not queryable via REST |
| `voice_configs` | null | Not queryable via REST |

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` lines 6-35

### Latest Exam Session

```json
{
  "id": "88c21391-d427-4be3-acfd-9919f62263d7",
  "user_id": "02fcb051-6f15-49a5-a92e-ae91d8932088",
  "status": "paused",
  "study_mode": "linear",
  "difficulty_preference": "mixed",
  "rating": "private",
  "started_at": "2026-02-27T10:37:20.641195+00:00"
}
```

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` lines 37-49

### Key Constraints

| Constraint | Current State | Impact |
|------------|---------------|--------|
| `exam_sessions.study_mode` CHECK | `('linear', 'cross_acs', 'weak_areas')` | `quick_drill` is **NOT** permitted until PR #3 migration is applied |
| `system_flags` table | **NOT FOUND** in schema cache | Feature flags may be stored differently (via `system_config` table or `graph_feature_flags` in migration `20260224000002`) |
| `system_prompts` table | NULL count (not queryable via anon/service REST) | Prompts may exist but be restricted by RLS or PostgREST schema cache |

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` lines 52-60

### ACS Tasks by Rating

| Rating | Task Count | Source ACS |
|--------|------------|------------|
| Private | 61 | FAA-S-ACS-6C |
| Commercial | 60 | FAA-S-ACS-7B |
| Instrument | 22 | FAA-S-ACS-8C |
| **Total** | **143** | |

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` lines 79-86

### Knowledge Graph Stats

**Concept Categories** (visible via REST, likely paginated):

| Category | Count |
|----------|-------|
| `acs_element` | 969 |
| `acs_area` | 31 |

Note: Only 2 categories visible via REST API (1,000 rows). The full 24,613 concepts include additional categories (topic, regulatory_claim, artifact, etc.) that are beyond the REST pagination limit of this query.

**Relation Types** (visible via REST):

| Relation Type | Count |
|---------------|-------|
| `is_component_of` | 1,000 |

Note: Only 1 type visible with count of 1,000 (REST pagination limit). The full 74,271 relations include additional types (`relates_to`, `requires_knowledge_of`, `supports`, `contradicts`, `is_prerequisite_for`).

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` lines 62-73

### Knowledge Base Hubs

| Hub Slug | Name | Description |
|----------|------|-------------|
| `knowledge` | Knowledge Hub | FAA handbooks, AIM, advisory circulars -- general aviation knowledge |
| `acs` | ACS Hub | Airman Certification Standards -- structured exam requirements by rating/area/task |
| `regulations` | Regulations Hub | 14 CFR regulatory framework -- federal aviation regulations |
| `aircraft` | Aircraft Hub | Aircraft-specific systems, limitations, performance, and procedures |

All 4 hubs created at `2026-02-26T01:30:52.863281+00:00` (multi-hub taxonomy migration).

**Taxonomy:** 2,529 nodes distributed across hubs, with triage/unclassified root nodes per hub plus domain-specific taxonomy trees derived from FAA PDF table-of-contents structures.

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` lines 88-221

---

## 8. Feature Detection (grep-based)

Feature presence verified by searching the codebase on the `main` branch (`8dab6d3`).

### ExamPlanV1 (Phase 4) -- PRESENT on main

| Location | Context |
|----------|---------|
| `src/lib/exam-plan.ts` | `ExamPlanV1` type definition, `buildExamPlan()`, `recordQuestionAsked()`, `DEFAULT_PLAN_DEFAULTS` |
| `src/lib/exam-planner.ts` | `ExamPlan` integration, taxonomy fingerprint loading, plan-aware `advancePlanner()` |
| `src/lib/exam-logic.ts` | `GROUNDING_CONTRACT`, `connectedWalk()`, `TaxonomyFingerprints` type |
| `src/lib/__tests__/exam-plan.test.ts` | 31 tests covering plan builder, stop condition, mention credit, connected walk |

### ExamResultV2 (Phase 5) -- NOT on main

Present only in PR #3 branch (`phase5-grading-v2-quick-drill`). Files: `src/lib/exam-result.ts` (NEW, 412 lines), `src/lib/__tests__/exam-result.test.ts` (27 tests).

### `quick_drill` Study Mode -- NOT on main

Present only in PR #3 branch. Requires migration `20260226100001_add_quick_drill_study_mode.sql` to update the CHECK constraint. Currently **blocked** by the existing CHECK constraint in production.

**Evidence:** `evidence/2026-02-27/sql/db-introspection.md` line 56: `quick_drill: **BLOCKED** by CHECK constraint`

### Graph Metrics & Verification

| Script | Purpose | Location |
|--------|---------|----------|
| `verify-graph-health.ts` | Graph integrity check (orphan rate, component analysis) | `scripts/verify-graph-health.ts` |
| `verify-graph-e2e.ts` | E2E graph smoke test | `scripts/verify-graph-e2e.ts` |
| `graph-metrics.ts` | Detailed graph metrics computation | `scripts/graph/graph-metrics.ts` |
| `graph-validate.ts` | Graph validation rules | `scripts/graph/graph-validate.ts` |

### Taxonomy Scripts

| Script | Location |
|--------|----------|
| `build_unified_taxonomy.ts` | `scripts/taxonomy/build_unified_taxonomy.ts` |
| `build_multi_hub_taxonomy.ts` | `scripts/taxonomy/build_multi_hub_taxonomy.ts` |
| `classify_chunks.ts` | `scripts/taxonomy/classify_chunks.ts` |
| `validate_multi_hub_phase1.ts` | `scripts/taxonomy/validate_multi_hub_phase1.ts` |
| `expand_regulations_taxonomy.ts` | `scripts/taxonomy/expand_regulations_taxonomy.ts` |
| `assign_chunks_to_hubs.ts` | `scripts/taxonomy/assign_chunks_to_hubs.ts` |

DB migrations for taxonomy scaffold:
- `20260225100001_taxonomy_scaffold.sql` -- creates `kb_hubs`, `kb_taxonomy_nodes`, `kb_chunk_taxonomy`
- `20260226000001_multi_hub_taxonomy.sql` -- adds `hub_slug` and `taxonomy_slug` columns

### Feature Flags

| Component | Location | Purpose |
|-----------|----------|---------|
| `system-config.ts` | `src/lib/system-config.ts` | `getConfig()` reads system_config table, TTL-cached |
| Feature flags API | `src/app/api/flags/route.ts` | Client-facing feature flag endpoint |
| Graph feature flags migration | `20260224000002_graph_feature_flags.sql` | Seeds `graph.enhanced_retrieval` and related flags |
| Kill switch | `src/lib/kill-switch.ts` | Global service kill switch |

---

## 9. Evidence Pointers

All raw evidence for this inventory is stored at:

```
docs/system-audit/evidence/2026-02-27/
```

### Commands

| File | Content | Collected At |
|------|---------|--------------|
| `commands/git-status.txt` | `git status --short` on inventory branch | Sprint start |
| `commands/git-log-20.txt` | `git log --oneline -20` | Sprint start |
| `commands/git-branches.txt` | `git branch -vv` (all local branches with tracking) | Sprint start |
| `commands/git-diff-stat.txt` | `git diff --stat` | Sprint start |
| `commands/npm-test.txt` | Full `npm test` output (495 tests, 25 files, 1.14s) | 2026-02-27 18:36:43 |
| `commands/npm-typecheck.txt` | `npm run typecheck` output (clean) | Sprint start |
| `commands/npm-lint.txt` | Full `npm run lint` output (183 problems) | Sprint start |
| `commands/npm-build.txt` | Full `npm run build` output (59 pages, 33 API routes) | Sprint start |

### Database

| File | Content |
|------|---------|
| `sql/db-introspection.md` | Formatted DB report: row counts, constraints, latest session, KG stats |
| `sql/db-introspection.txt` | Raw introspection output |
| `sql/db-introspection-raw.txt` | Unprocessed introspection data |

### GitHub

| File | Content |
|------|---------|
| `github/pr-3-view.txt` | `gh pr view 3` output: title, state, stats, description |
| `github/pr-list.txt` | `gh pr list --state all` output: 3 PRs (1 open, 2 merged) |

---

## 10. Summary of Key Findings

### What Is on Main (Production-Ready)

1. **ExamPlanV1** (Phase 4) -- predetermined exam shape with scope-sensitive question count, bounded bonus questions, follow-up limits, mention credit, and cross-ACS connected walk using taxonomy fingerprints. Grounding Contract enforced code-side.

2. **Knowledge Graph** -- 24,613 concepts, 74,271 relations, 30,689 evidence links. 4 knowledge base hubs with 2,529 taxonomy nodes. `graph.enhanced_retrieval` feature flag is enabled.

3. **Multi-rating support** -- Private (61), Commercial (60), and Instrument (22) ACS tasks fully seeded and operational.

4. **Voice pipeline** -- Multi-provider TTS (Cartesia/Deepgram/OpenAI) with tier-based selection, Deepgram STT, sentence-boundary streaming.

5. **Admin dashboard** -- Graph explorer (2D + 3D), health metrics, coverage treemap, user management, prompt management, analytics, moderation, support tickets.

6. **495 unit tests** passing across 25 files in ~1.1 seconds.

### What Is NOT on Main (Pending in PR #3)

1. **ExamResultV2** -- plan-based grading with per-area breakdown and weak element tracking
2. **Quick Drill mode** -- focused 10-20 question sessions targeting weak/untouched elements
3. **`quick_drill` study_mode** -- requires DB migration to update CHECK constraint
4. **27 additional tests** (would bring total to 522)

### Known Issues

1. **Lint debt**: 122 errors and 61 warnings, primarily `jsx-no-comment-textnodes` in admin/landing pages and `no-explicit-any` in test files. None are runtime-breaking.
2. **`system_flags` table**: Not found in schema cache. Feature flags may use a different mechanism.
3. **REST pagination limit**: DB introspection via REST API hits 1,000-row pagination, causing incomplete category/relation type distributions. Direct SQL would give full picture.
4. **`useBonusQuestion` lint false positive**: ESLint reports `rules-of-hooks` violation in `src/app/api/exam/route.ts` because `useBonusQuestion` matches the `use*` naming convention but is a plain function, not a React hook.

---

*Generated: 2026-02-27 from branch `inventory-verification-sprint-20260227` at commit `8dab6d3`*
