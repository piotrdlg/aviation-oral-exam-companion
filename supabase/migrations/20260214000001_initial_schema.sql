-- ============================================================
-- Aviation Oral Exam Companion — Database Schema
-- Phase 1: Full schema with constraints, indexes, RLS
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- 1. ACS Tasks (immutable reference data)
-- ============================================================
CREATE TABLE acs_tasks (
  id TEXT PRIMARY KEY,                      -- e.g., "PA.I.F.K1"
  rating TEXT NOT NULL,                     -- "private", "instrument", etc.
  area TEXT NOT NULL,                       -- "Preflight Preparation"
  task TEXT NOT NULL,                       -- "Weather Information"
  knowledge_elements JSONB NOT NULL DEFAULT '[]',
  risk_management_elements JSONB DEFAULT '[]',
  skill_elements JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Concepts (knowledge graph nodes)
-- ============================================================
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,                -- "{category}:{normalized-name}"
  name_normalized TEXT NOT NULL,            -- lowercase, no punctuation
  aliases TEXT[] DEFAULT '{}',              -- e.g., {'Va', 'maneuvering speed'}
  acs_task_id TEXT REFERENCES acs_tasks(id) ON DELETE SET NULL,
  category TEXT NOT NULL,                   -- "aerodynamics", "weather", etc.
  content TEXT NOT NULL,                    -- detailed explanation
  key_facts JSONB DEFAULT '[]',            -- array of testable facts
  common_misconceptions JSONB DEFAULT '[]',
  embedding VECTOR(1536),                  -- for semantic search
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  embedding_dim INT DEFAULT 1536,
  embedding_status TEXT DEFAULT 'current' CHECK (embedding_status IN ('current', 'stale')),
  extraction_confidence FLOAT,
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'validated', 'rejected', 'needs_edit')),
  validated_at TIMESTAMPTZ,
  validated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated tsvector column for full-text search
ALTER TABLE concepts ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(key_facts::text, '')), 'C')
  ) STORED;

-- Indexes for concepts
CREATE INDEX idx_concepts_fts ON concepts USING GIN (fts);
CREATE INDEX idx_concepts_embedding ON concepts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_concepts_acs_task ON concepts (acs_task_id);
CREATE INDEX idx_concepts_category ON concepts (category);
CREATE INDEX idx_concepts_validation ON concepts (validation_status);
CREATE INDEX idx_concepts_embedding_status ON concepts (embedding_status);
CREATE INDEX idx_concepts_key_facts ON concepts USING GIN (key_facts);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER concepts_updated_at
  BEFORE UPDATE ON concepts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-mark embedding stale when content changes
CREATE OR REPLACE FUNCTION mark_embedding_stale()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name
     OR OLD.content IS DISTINCT FROM NEW.content
     OR OLD.key_facts IS DISTINCT FROM NEW.key_facts THEN
    NEW.embedding_status = 'stale';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER concepts_embedding_stale
  BEFORE UPDATE ON concepts
  FOR EACH ROW EXECUTE FUNCTION mark_embedding_stale();

-- ============================================================
-- 3. Concept Relations (knowledge graph edges)
-- ============================================================
CREATE TABLE concept_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'requires_knowledge_of',
    'leads_to_discussion_of',
    'is_component_of',
    'contrasts_with',
    'mitigates_risk_of',
    'applies_in_scenario'
  )),
  weight FLOAT DEFAULT 1.0,
  examiner_transition TEXT,                -- "You mentioned Va protects..."
  context TEXT,                            -- "in turbulence discussion"
  confidence FLOAT DEFAULT 1.0,
  CONSTRAINT no_self_reference CHECK (source_id <> target_id),
  CONSTRAINT unique_edge UNIQUE (source_id, target_id, relation_type)
);

CREATE INDEX idx_relations_source ON concept_relations (source_id);
CREATE INDEX idx_relations_target ON concept_relations (target_id);
CREATE INDEX idx_relations_composite ON concept_relations (source_id, target_id);

-- ============================================================
-- 4. Admin Users (allowlist for RLS)
-- ============================================================
CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. Exam Sessions
-- ============================================================
CREATE TABLE exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  acs_tasks_covered JSONB DEFAULT '[]',
  concept_path JSONB DEFAULT '[]',
  weak_areas JSONB DEFAULT '[]',
  current_concept_id UUID REFERENCES concepts(id),
  return_to_concept_id UUID REFERENCES concepts(id),  -- for off-graph pivot return
  pivot_count INT DEFAULT 0,
  exchange_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_sessions_user ON exam_sessions (user_id);
CREATE INDEX idx_sessions_status ON exam_sessions (status);

-- ============================================================
-- 6. Session Transcripts
-- ============================================================
CREATE TABLE session_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exchange_number INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('examiner', 'student')),
  text TEXT NOT NULL,
  audio_storage_path TEXT,
  concept_id UUID REFERENCES concepts(id),
  assessment JSONB,                        -- AssessmentResult JSON
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcripts_session ON session_transcripts (session_id);
CREATE INDEX idx_transcripts_order ON session_transcripts (session_id, exchange_number);

-- ============================================================
-- 7. Latency Logs
-- ============================================================
CREATE TABLE latency_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exchange_number INT NOT NULL,
  vad_to_stt_ms INT,
  stt_duration_ms INT,
  stt_audio_size_kb FLOAT,
  stt_to_llm_first_token_ms INT,
  llm_total_ms INT,
  llm_to_tts_first_byte_ms INT,
  total_pipeline_ms INT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_latency_session ON latency_logs (session_id);

-- ============================================================
-- 8. Off-Graph Mentions (parking lot)
-- ============================================================
CREATE TABLE off_graph_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  raw_phrase TEXT NOT NULL,
  nearest_concept_id UUID REFERENCES concepts(id),
  retrieval_confidence FLOAT,
  pivot_occurred BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offgraph_session ON off_graph_mentions (session_id);
CREATE INDEX idx_offgraph_processed ON off_graph_mentions (processed);

-- ============================================================
-- 9. RLS Policies
-- ============================================================
ALTER TABLE acs_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE latency_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE off_graph_mentions ENABLE ROW LEVEL SECURITY;

-- Helper function: is current user admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ACS Tasks: read-only for all authenticated
CREATE POLICY "acs_tasks_read" ON acs_tasks
  FOR SELECT TO authenticated USING (true);

-- Concepts: read validated for all, full CRUD for admin
CREATE POLICY "concepts_read_validated" ON concepts
  FOR SELECT TO authenticated
  USING (validation_status = 'validated' OR is_admin());

CREATE POLICY "concepts_admin_insert" ON concepts
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "concepts_admin_update" ON concepts
  FOR UPDATE TO authenticated
  USING (is_admin());

CREATE POLICY "concepts_admin_delete" ON concepts
  FOR DELETE TO authenticated
  USING (is_admin());

-- Concept Relations: read for all (where both concepts are visible), CRUD for admin
CREATE POLICY "relations_read" ON concept_relations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "relations_admin_insert" ON concept_relations
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "relations_admin_update" ON concept_relations
  FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "relations_admin_delete" ON concept_relations
  FOR DELETE TO authenticated USING (is_admin());

-- Admin Users: only admin can see
CREATE POLICY "admin_users_read" ON admin_users
  FOR SELECT TO authenticated USING (is_admin());

-- Exam Sessions: user owns their own
CREATE POLICY "sessions_user_select" ON exam_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "sessions_user_insert" ON exam_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "sessions_user_update" ON exam_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "sessions_user_delete" ON exam_sessions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Session Transcripts: via session ownership
CREATE POLICY "transcripts_user_select" ON session_transcripts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

CREATE POLICY "transcripts_user_insert" ON session_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

-- Latency Logs: via session ownership
CREATE POLICY "latency_user_select" ON latency_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

CREATE POLICY "latency_user_insert" ON latency_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

-- Off-Graph Mentions: insert for any user, read/update for admin
CREATE POLICY "offgraph_user_insert" ON off_graph_mentions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

CREATE POLICY "offgraph_admin_select" ON off_graph_mentions
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "offgraph_admin_update" ON off_graph_mentions
  FOR UPDATE TO authenticated USING (is_admin());

-- ============================================================
-- 10. RPC Functions
-- ============================================================

-- Hybrid search function
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category TEXT,
  content TEXT,
  key_facts JSONB,
  score FLOAT
) AS $$
DECLARE
  is_aviation_term BOOLEAN;
  exact_weight FLOAT := 0.1;
BEGIN
  -- Boost exact match weight for aviation patterns
  is_aviation_term := query_text ~* '^v[a-z0-9]+$'
    OR query_text ~* '^\d{2}\.\d{3}$'
    OR query_text ~* '^k[a-z]{3}$'
    OR query_text ~* '^[A-Z]{2,6}$';

  IF is_aviation_term THEN
    exact_weight := 0.3;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.slug,
    c.category,
    c.content,
    c.key_facts,
    (
      0.6 * (1 - (c.embedding <=> query_embedding))  -- vector similarity (1 - cosine distance)
      + (1.0 - exact_weight - 0.6) * (ts_rank(c.fts, plainto_tsquery('english', query_text)) / (1 + ts_rank(c.fts, plainto_tsquery('english', query_text))))  -- normalized ts_rank
      + exact_weight * CASE
          WHEN c.name_normalized = lower(query_text) THEN 1.0
          WHEN lower(query_text) = ANY(c.aliases) THEN 1.0
          ELSE 0.0
        END
    )::FLOAT AS score
  FROM concepts c
  WHERE c.validation_status = 'validated'
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Graph traversal function (recursive CTE)
CREATE OR REPLACE FUNCTION get_related_concepts(
  start_concept_id UUID,
  max_depth INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  depth INT,
  relation_type TEXT,
  examiner_transition TEXT,
  weight FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE related AS (
    SELECT
      c.id,
      c.name,
      c.category,
      0 AS depth,
      NULL::TEXT AS relation_type,
      NULL::TEXT AS examiner_transition,
      NULL::FLOAT AS weight,
      ARRAY[c.id] AS path
    FROM concepts c
    WHERE c.id = start_concept_id

    UNION ALL

    SELECT
      c.id,
      c.name,
      c.category,
      r.depth + 1,
      cr.relation_type,
      cr.examiner_transition,
      cr.weight,
      r.path || c.id
    FROM concepts c
    JOIN concept_relations cr ON c.id = cr.target_id
    JOIN related r ON cr.source_id = r.id
    WHERE r.depth < max_depth
      AND NOT c.id = ANY(r.path)
      AND c.validation_status = 'validated'
  )
  SELECT DISTINCT ON (related.id)
    related.id,
    related.name,
    related.category,
    related.depth,
    related.relation_type,
    related.examiner_transition,
    related.weight
  FROM related
  ORDER BY related.id, related.depth;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get uncovered ACS tasks for a session
CREATE OR REPLACE FUNCTION get_uncovered_acs_tasks(
  p_session_id UUID
)
RETURNS TABLE (
  task_id TEXT,
  area TEXT,
  task TEXT,
  concept_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    at.id AS task_id,
    at.area,
    at.task,
    COUNT(c.id) AS concept_count
  FROM acs_tasks at
  LEFT JOIN concepts c ON c.acs_task_id = at.id AND c.validation_status = 'validated'
  WHERE at.id NOT IN (
    SELECT (elem->>'task_id')::TEXT
    FROM exam_sessions es,
    jsonb_array_elements(es.acs_tasks_covered) AS elem
    WHERE es.id = p_session_id
      AND elem->>'status' = 'satisfactory'
  )
  GROUP BY at.id, at.area, at.task
  ORDER BY concept_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
