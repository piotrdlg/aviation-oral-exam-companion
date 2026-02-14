-- ============================================================
-- Migration: element_attempts — per-element scoring + mentions
-- Merged table: scored attempts + unscored mentions with tag_type discriminator
-- ============================================================

CREATE TABLE element_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  transcript_id UUID NOT NULL REFERENCES session_transcripts(id) ON DELETE CASCADE,
  element_code TEXT NOT NULL REFERENCES acs_elements(code),
  tag_type TEXT NOT NULL DEFAULT 'attempt'
    CHECK (tag_type IN ('attempt','mention')),
  score TEXT CHECK (score IN ('satisfactory','partial','unsatisfactory')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  confidence FLOAT,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Invariants:
  -- 1. Attempts MUST have a score; mentions MUST NOT
  CONSTRAINT score_attempt_consistency
    CHECK ((tag_type = 'attempt') = (score IS NOT NULL)),
  -- 2. is_primary only valid for attempts
  CONSTRAINT primary_only_for_attempts
    CHECK (NOT (is_primary AND tag_type <> 'attempt')),
  -- 3. No duplicate element+type per transcript
  CONSTRAINT unique_element_per_transcript
    UNIQUE (transcript_id, element_code, tag_type)
);

-- At most one primary attempt per student transcript turn
CREATE UNIQUE INDEX idx_attempts_one_primary
  ON element_attempts (transcript_id)
  WHERE is_primary = true;

CREATE INDEX idx_attempts_session ON element_attempts (session_id);
CREATE INDEX idx_attempts_element ON element_attempts (element_code);
CREATE INDEX idx_attempts_score ON element_attempts (score) WHERE tag_type = 'attempt';

-- Trigger: enforce session_id consistency with transcript
CREATE OR REPLACE FUNCTION enforce_attempt_session_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.session_id := (SELECT session_id FROM session_transcripts WHERE id = NEW.transcript_id);
  IF NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'transcript_id % not found', NEW.transcript_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER element_attempts_enforce_session
  BEFORE INSERT ON element_attempts
  FOR EACH ROW EXECUTE FUNCTION enforce_attempt_session_id();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE element_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attempts_user_select" ON element_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

CREATE POLICY "attempts_user_insert" ON element_attempts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM exam_sessions WHERE id = session_id AND user_id = auth.uid()));

-- ============================================================
-- RPC: get_element_scores — aggregate element performance
-- ============================================================
CREATE OR REPLACE FUNCTION get_element_scores(
  p_user_id UUID,
  p_rating TEXT DEFAULT 'private'
)
RETURNS TABLE (
  element_code TEXT,
  task_id TEXT,
  area TEXT,
  element_type TEXT,
  difficulty_default TEXT,
  total_attempts BIGINT,
  satisfactory_count BIGINT,
  partial_count BIGINT,
  unsatisfactory_count BIGINT,
  latest_score TEXT,
  latest_attempt_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ae.code AS element_code,
    ae.task_id,
    at2.area,
    ae.element_type,
    ae.difficulty_default,
    COUNT(ea.id) AS total_attempts,
    COUNT(ea.id) FILTER (WHERE ea.score = 'satisfactory') AS satisfactory_count,
    COUNT(ea.id) FILTER (WHERE ea.score = 'partial') AS partial_count,
    COUNT(ea.id) FILTER (WHERE ea.score = 'unsatisfactory') AS unsatisfactory_count,
    (SELECT ea2.score FROM element_attempts ea2
     JOIN exam_sessions es2 ON es2.id = ea2.session_id
     WHERE ea2.element_code = ae.code AND es2.user_id = p_user_id
       AND ea2.tag_type = 'attempt'
     ORDER BY ea2.created_at DESC LIMIT 1) AS latest_score,
    MAX(ea.created_at) AS latest_attempt_at
  FROM acs_elements ae
  JOIN acs_tasks at2 ON at2.id = ae.task_id
  LEFT JOIN element_attempts ea ON ea.element_code = ae.code
    AND ea.tag_type = 'attempt'
    AND EXISTS (SELECT 1 FROM exam_sessions es WHERE es.id = ea.session_id AND es.user_id = p_user_id)
  WHERE at2.rating = p_rating
  GROUP BY ae.code, ae.task_id, at2.area, ae.element_type, ae.difficulty_default
  ORDER BY at2.area, ae.task_id, ae.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
