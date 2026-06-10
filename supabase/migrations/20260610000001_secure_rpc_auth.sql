-- ============================================================
-- Migration: Secure RPC Authorization (W1.1 Security Fix)
-- ============================================================
-- CRITICAL FIX: Close cross-user data exposure in SECURITY DEFINER RPCs
--
-- Three RPCs were callable by any authenticated user with cross-user parameters:
-- - get_element_scores(p_user_id) — allowed reading any user's lifetime scores
-- - get_session_element_scores(p_session_id) — allowed reading any session's scores
-- - get_uncovered_acs_tasks(p_session_id) — allowed reading any session's uncovered tasks
--
-- FIXES:
-- 1. Add ownership checks (auth.uid() = p_user_id or via exam_sessions.user_id)
-- 2. Allow service_role (auth.uid() IS NULL) to bypass for server-side calls
-- 3. Add SET search_path = public to all SECURITY DEFINER functions (D1 fix)
-- ============================================================

-- ============================================================
-- 1. SECURE get_element_scores — check auth.uid() = p_user_id
--    Service role (auth.uid() IS NULL) is allowed for instructor insights.
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
  -- Enforce ownership: authenticated user can only read own scores
  -- Service role (auth.uid() IS NULL) allowed for server-side instructor insights
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
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

-- ============================================================
-- 2. SECURE get_session_element_scores — verify session ownership via exam_sessions.user_id
--    Service role (auth.uid() IS NULL) allowed for instructor insights.
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
  -- Enforce ownership: verified via exam_sessions.user_id
  -- Service role (auth.uid() IS NULL) allowed
  IF auth.uid() IS NOT NULL THEN
    -- Check that the session belongs to the authenticated user
    IF NOT EXISTS (
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

-- ============================================================
-- 3. SECURE get_uncovered_acs_tasks — verify session ownership via exam_sessions.user_id
--    Service role (auth.uid() IS NULL) allowed.
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
  -- Enforce ownership: verified via exam_sessions.user_id
  -- Service role (auth.uid() IS NULL) allowed
  IF auth.uid() IS NOT NULL THEN
    -- Check that the session belongs to the authenticated user
    IF NOT EXISTS (
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

-- ============================================================
-- 4. ADD SET search_path to remaining SECURITY DEFINER functions (D1 fix)
-- ============================================================

-- hybrid_search (20260214000001:367)
DROP FUNCTION IF EXISTS hybrid_search(TEXT, TEXT);
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_type TEXT DEFAULT 'all'
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  content TEXT,
  embedding_status TEXT,
  avg_depth NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.slug,
    c.name,
    c.content,
    c.embedding_status,
    COALESCE(AVG(cr.to_depth), 0)::NUMERIC AS avg_depth
  FROM concepts c
  LEFT JOIN concept_relations cr ON cr.from_id = c.id
  WHERE (query_type = 'all'
    OR (query_type = 'evidence' AND c.is_evidence_anchor = true)
    OR (query_type = 'regulatory' AND c.regulatory_claim IS NOT NULL))
    AND (query_text IS NULL OR query_text = ''
    OR c.name ILIKE '%' || query_text || '%'
    OR c.content ILIKE '%' || query_text || '%')
  GROUP BY c.id
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_related_concepts (20260214000001:427)
DROP FUNCTION IF EXISTS get_related_concepts(UUID, INT);
CREATE OR REPLACE FUNCTION get_related_concepts(
  start_id UUID,
  max_depth INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  relation_type TEXT,
  depth INT,
  path UUID[]
) AS $$
WITH RECURSIVE concept_tree AS (
  SELECT
    c.id,
    c.slug,
    c.name,
    cr.relation_type,
    1 AS depth,
    ARRAY[c.id] AS path
  FROM concepts c
  LEFT JOIN concept_relations cr ON (c.id = cr.from_id OR c.id = cr.to_id)
  WHERE c.id = start_id

  UNION ALL

  SELECT
    c.id,
    c.slug,
    c.name,
    cr.relation_type,
    ct.depth + 1,
    ct.path || c.id
  FROM concept_tree ct
  JOIN concept_relations cr ON (ct.id = cr.from_id OR ct.id = cr.to_id)
  JOIN concepts c ON (
    CASE
      WHEN ct.id = cr.from_id THEN c.id = cr.to_id
      ELSE c.id = cr.from_id
    END
  )
  WHERE ct.depth < max_depth
    AND NOT c.id = ANY(ct.path)
)
SELECT DISTINCT ON (id) * FROM concept_tree
WHERE depth <= max_depth
ORDER BY id, depth;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
