-- ============================================================
-- Migration: Session resume support + session-scoped element scores
-- 1. New RPC: get_session_element_scores — per-session element performance
-- 2. Update RPC: get_element_scores — add description to return type
-- ============================================================

-- ============================================================
-- 1. New RPC: get_session_element_scores
-- Session-scoped version of get_element_scores. Returns all ACS
-- elements for the session's rating with attempt stats filtered
-- to a single session.
-- ============================================================
CREATE OR REPLACE FUNCTION get_session_element_scores(
  p_session_id UUID
)
RETURNS TABLE (
  element_code TEXT,
  task_id TEXT,
  area TEXT,
  element_type TEXT,
  difficulty_default TEXT,
  description TEXT,
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
    ae.description,
    COUNT(ea.id) AS total_attempts,
    COUNT(ea.id) FILTER (WHERE ea.score = 'satisfactory') AS satisfactory_count,
    COUNT(ea.id) FILTER (WHERE ea.score = 'partial') AS partial_count,
    COUNT(ea.id) FILTER (WHERE ea.score = 'unsatisfactory') AS unsatisfactory_count,
    (SELECT ea2.score FROM element_attempts ea2
     WHERE ea2.element_code = ae.code AND ea2.session_id = p_session_id
       AND ea2.tag_type = 'attempt'
     ORDER BY ea2.created_at DESC LIMIT 1) AS latest_score,
    MAX(ea.created_at) AS latest_attempt_at
  FROM acs_elements ae
  JOIN acs_tasks at2 ON at2.id = ae.task_id
  LEFT JOIN element_attempts ea ON ea.element_code = ae.code
    AND ea.tag_type = 'attempt'
    AND ea.session_id = p_session_id
  WHERE at2.rating = (
    SELECT es.rating FROM exam_sessions es WHERE es.id = p_session_id
  )
  GROUP BY ae.code, ae.task_id, at2.area, ae.element_type, ae.difficulty_default, ae.description
  ORDER BY at2.area, ae.task_id, ae.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Update get_element_scores to include description
-- Must DROP first because adding a return column changes the
-- return type, which CREATE OR REPLACE does not allow.
-- ============================================================
DROP FUNCTION IF EXISTS get_element_scores(UUID, TEXT);
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
  description TEXT,
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
    ae.description,
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
  GROUP BY ae.code, ae.task_id, at2.area, ae.element_type, ae.difficulty_default, ae.description
  ORDER BY at2.area, ae.task_id, ae.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
