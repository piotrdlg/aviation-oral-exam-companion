# Database Schema Documentation

This document describes the PostgreSQL database schema hosted on Supabase. The schema is defined in two migration files under `supabase/migrations/`.

## Extensions

| Extension | Purpose |
|-----------|---------|
| `vector` (pgvector) | 1536-dimensional embeddings for semantic search |
| `pg_trgm` | Trigram-based fuzzy text matching |

## Tables

### `acs_tasks` — ACS Reference Data

Immutable table containing all 61 Private Pilot ACS tasks extracted from FAA-S-ACS-6C (November 2023).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PRIMARY KEY` | Task ID (e.g., `PA.I.A`, `PA.IX.G`) |
| `rating` | `TEXT NOT NULL` | Certificate level (`private`) |
| `area` | `TEXT NOT NULL` | Area of Operation name |
| `task` | `TEXT NOT NULL` | Task name |
| `knowledge_elements` | `JSONB` | Array of `{code, description}` objects |
| `risk_management_elements` | `JSONB` | Array of `{code, description}` objects |
| `skill_elements` | `JSONB` | Array of `{code, description}` objects |

**ID Format**: `PA.{Area}.{Task}` where Area is a Roman numeral (I-XII) and Task is a letter (A-N).

**Element Code Format**: `PA.{Area}.{Task}.{K/R/S}{number}` — K=Knowledge, R=Risk Management, S=Skill.

**Task counts by area**:

| Area | Name | Tasks |
|------|------|-------|
| I | Preflight Preparation | 9 (A-I) |
| II | Preflight Procedures | 6 (A-F) |
| III | Airport and Seaplane Base Operations | 2 (A-B) |
| IV | Takeoffs, Landings, and Go-Arounds | 14 (A-N) |
| V | Performance and Ground Reference Maneuvers | 2 (A-B) |
| VI | Navigation | 4 (A-D) |
| VII | Slow Flight and Stalls | 4 (A-D) |
| VIII | Basic Instrument Maneuvers | 6 (A-F) |
| IX | Emergency Operations | 7 (A-G) |
| X | Multiengine Operations | 4 (A-D) |
| XI | Night Operations | 1 (A) |
| XII | Postflight Procedures | 2 (A-B) |
| **Total** | | **61** |

### `concepts` — Knowledge Graph Nodes

Stores aviation concepts with vector embeddings for semantic search and full-text search.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PRIMARY KEY` | Auto-generated |
| `name` | `TEXT NOT NULL` | Concept name |
| `slug` | `TEXT UNIQUE` | `{category}:{normalized-name}` |
| `name_normalized` | `TEXT` | Lowercase, no punctuation |
| `aliases` | `TEXT[]` | Alternative names (e.g., `{'Va', 'maneuvering speed'}`) |
| `acs_task_id` | `TEXT FK` | Links to `acs_tasks.id` |
| `category` | `TEXT NOT NULL` | Domain (aerodynamics, weather, etc.) |
| `content` | `TEXT NOT NULL` | Detailed explanation |
| `key_facts` | `JSONB` | Array of testable facts |
| `common_misconceptions` | `JSONB` | Array of common errors |
| `embedding` | `VECTOR(1536)` | text-embedding-3-small vector |
| `embedding_status` | `TEXT` | `current` or `stale` |
| `validation_status` | `TEXT` | `pending`, `validated`, `rejected`, `needs_edit` |
| `fts` | `tsvector GENERATED` | Weighted full-text search (A=name, B=content, C=key_facts) |

**Indexes**: GIN on `fts`, HNSW on `embedding` (cosine), B-tree on `acs_task_id`, `category`, `validation_status`.

**Triggers**:
- `concepts_updated_at` — Auto-updates `updated_at` on row change
- `concepts_embedding_stale` — Marks `embedding_status = 'stale'` when name/content/key_facts change

### `concept_relations` — Knowledge Graph Edges

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PRIMARY KEY` | Auto-generated |
| `source_id` | `UUID FK` | Source concept |
| `target_id` | `UUID FK` | Target concept |
| `relation_type` | `TEXT CHECK` | One of 6 types (see below) |
| `weight` | `FLOAT` | Edge weight (default 1.0) |
| `examiner_transition` | `TEXT` | Natural DPE transition phrase |
| `context` | `TEXT` | When this relation applies |
| `confidence` | `FLOAT` | Extraction confidence |

**Relation Types**:
- `requires_knowledge_of` — Prerequisite knowledge
- `leads_to_discussion_of` — Natural topic transition
- `is_component_of` — Part-whole relationship
- `contrasts_with` — Comparison/distinction
- `mitigates_risk_of` — Risk mitigation link
- `applies_in_scenario` — Scenario-based connection

### `exam_sessions` — User Sessions

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PRIMARY KEY` | Auto-generated |
| `user_id` | `UUID FK` | References `auth.users` |
| `rating` | `TEXT` | Certificate level (default `private`) |
| `status` | `TEXT CHECK` | `active`, `paused`, or `completed` |
| `started_at` | `TIMESTAMPTZ` | Session start time |
| `ended_at` | `TIMESTAMPTZ` | Set when status becomes `completed` |
| `acs_tasks_covered` | `JSONB` | Array of `{task_id, status}` |
| `exchange_count` | `INT` | Number of Q&A exchanges |
| `concept_path` | `JSONB` | Ordered list of concepts visited |
| `weak_areas` | `JSONB` | Identified weak areas |
| `current_concept_id` | `UUID FK` | Current graph position |
| `pivot_count` | `INT` | Off-graph pivots taken |

### `session_transcripts` — Conversation History

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID PRIMARY KEY` | Auto-generated |
| `session_id` | `UUID FK` | References `exam_sessions` |
| `exchange_number` | `INT` | Ordered exchange index |
| `role` | `TEXT CHECK` | `examiner` or `student` |
| `text` | `TEXT` | Message content |
| `audio_storage_path` | `TEXT` | Path to stored audio (future) |
| `concept_id` | `UUID FK` | Concept being discussed |
| `assessment` | `JSONB` | Assessment result for student messages |

### `latency_logs` — Performance Metrics

Tracks voice pipeline latency per exchange for monitoring.

| Column | Type | Description |
|--------|------|-------------|
| `vad_to_stt_ms` | `INT` | Voice activity detection to STT start |
| `stt_duration_ms` | `INT` | Speech-to-text processing time |
| `stt_to_llm_first_token_ms` | `INT` | STT complete to first LLM token |
| `llm_total_ms` | `INT` | Total LLM generation time |
| `llm_to_tts_first_byte_ms` | `INT` | LLM complete to first TTS audio byte |
| `total_pipeline_ms` | `INT` | End-to-end latency |

### `off_graph_mentions` — Parking Lot

Captures student mentions that don't match any concept in the knowledge graph, for later review and graph expansion.

### `admin_users` — Admin Allowlist

Simple table linking `auth.users` IDs to admin privileges. Used by the `is_admin()` helper function.

## Row-Level Security (RLS)

All tables have RLS enabled. Key policies:

| Table | Policy |
|-------|--------|
| `acs_tasks` | Read-only for all authenticated users |
| `concepts` | Read validated concepts; admin full CRUD |
| `concept_relations` | Read all; admin full CRUD |
| `exam_sessions` | Users can only access their own sessions |
| `session_transcripts` | Access through session ownership |
| `latency_logs` | Access through session ownership |
| `off_graph_mentions` | Users insert; admin read/update |
| `admin_users` | Admin-only read |

## RPC Functions

### `hybrid_search(query_text, query_embedding, match_count, similarity_threshold)`

Combines three search strategies with configurable weights:
- **60%** — Vector cosine similarity (pgvector)
- **30%** — Full-text search rank (tsvector)
- **10%** — Exact match on name/aliases (boosted to 30% for aviation terms like V-speeds, frequencies, airport codes)

### `get_related_concepts(start_concept_id, max_depth)`

Recursive CTE traversal of the concept graph. Returns related concepts up to `max_depth` hops away with relation metadata.

### `get_uncovered_acs_tasks(p_session_id)`

Returns ACS tasks not yet marked "satisfactory" in a session, ordered by number of associated concepts (richest topics first).

## Migrations

| File | Description |
|------|-------------|
| `20260214000001_initial_schema.sql` | Full schema: 8 tables, indexes, triggers, RLS, RPC functions |
| `20260214000002_seed_acs_tasks.sql` | 61 ACS task INSERT statements in a single transaction |

To apply migrations to a linked Supabase project:

```bash
npx supabase db push --linked
```
