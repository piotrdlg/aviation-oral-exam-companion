-- ============================================================
-- Migration: Secure RPC Authorization (W1.1 Security Fix)
-- ============================================================
-- CRITICAL FIX: Close cross-user data exposure in SECURITY DEFINER RPCs
-- (Review 06 finding C1) and pin search_path (finding D1).
--
-- Three RPCs were callable by any authenticated user with cross-user
-- parameters:
-- - get_element_scores(p_user_id)         — any user's lifetime scores
-- - get_session_element_scores(p_session_id) — any session's scores
-- - get_uncovered_acs_tasks(p_session_id)    — any session's coverage
--
-- AUTH GUARD DESIGN (note: an earlier draft used "allow when
-- auth.uid() IS NULL" as the service-role escape — that is WRONG,
-- because anon-key requests also have auth.uid() = NULL and would
-- have been allowed. The correct escape checks auth.role()):
--   allow when auth.role() = 'service_role'        (server-side calls:
--     exam-planner weak-areas, instructor insights, smoke scripts)
--   else require auth.uid() ownership               (own data only)
--   anon (auth.uid() NULL, role 'anon')             → forbidden
-- Plus REVOKE EXECUTE FROM anon as defense in depth.
--
-- Function bodies are copied VERBATIM from their latest definitions
-- (20260218200001 for the two score RPCs, 20260214000001 for
-- get_uncovered_acs_tasks) — only the guard + search_path are added.
--
-- hybrid_search / get_related_concepts (dead code, removed in W5.1)
-- get search_path pinned via ALTER FUNCTION without touching bodies.
-- ============================================================

-- ============================================================
-- 1. SECURE get_element_scores
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
  -- Ownership guard (C1): service_role passes; users only their own id;
  -- anon (auth.uid() NULL without service_role) is always forbidden.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cannot access another user''s element scores';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_element_scores(UUID, TEXT) FROM anon;

-- ============================================================
-- 2. SECURE get_session_element_scores
-- ============================================================
DROP FUNCTION IF EXISTS get_session_element_scores(UUID);
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
  -- Ownership guard (C1): session must belong to the caller unless service_role.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM exam_sessions WHERE id = p_session_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'forbidden: cannot access another user''s session';
    END IF;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_session_element_scores(UUID) FROM anon;

-- ============================================================
-- 3. SECURE get_uncovered_acs_tasks
-- ============================================================
DROP FUNCTION IF EXISTS get_uncovered_acs_tasks(UUID);
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
  -- Ownership guard (C1): session must belong to the caller unless service_role.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM exam_sessions WHERE id = p_session_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'forbidden: cannot access another user''s session';
    END IF;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_uncovered_acs_tasks(UUID) FROM anon;

-- ============================================================
-- 4. Pin search_path on remaining SECURITY DEFINER functions (D1)
-- Bodies untouched — these are dead code slated for removal in W5.1;
-- ALTER FUNCTION is sufficient and avoids redefinition risk.
-- (Original signatures from 20260214000001_initial_schema.sql.)
-- ============================================================
ALTER FUNCTION hybrid_search(TEXT, VECTOR, INT, FLOAT) SET search_path = public;
ALTER FUNCTION get_related_concepts(UUID, INT) SET search_path = public;
