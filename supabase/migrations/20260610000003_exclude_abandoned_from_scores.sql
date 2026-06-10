-- ============================================================
-- Migration: Exclude abandoned/expired sessions from lifetime scores (W2.5)
-- ============================================================
-- The discard-exam UI promises "won't count toward your progress", but
-- get_element_scores joined element_attempts with no session-status filter,
-- so abandoned/expired sessions fed the treemap, weak areas, readiness
-- score, and quick-drill targeting (review-02 bug 17).
--
-- This CREATE OR REPLACE preserves the W1.1 security guard verbatim
-- (auth.role() service escape + ownership + REVOKE stays in effect from
-- 20260610000001) and adds the status filter to BOTH attempt subqueries.
--
-- get_session_element_scores is intentionally NOT filtered: it is scoped to
-- one explicitly chosen session — viewing an abandoned session's own history
-- should still work.
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
  -- Ownership guard (W1.1 / C1): service_role passes; users only their own
  -- id; anon (auth.uid() NULL without service_role) is always forbidden.
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
       AND es2.status NOT IN ('abandoned', 'expired')  -- W2.5 (bug 17)
       AND ea2.tag_type = 'attempt'
     ORDER BY ea2.created_at DESC LIMIT 1) AS latest_score,
    MAX(ea.created_at) AS latest_attempt_at
  FROM acs_elements ae
  JOIN acs_tasks at2 ON at2.id = ae.task_id
  LEFT JOIN element_attempts ea ON ea.element_code = ae.code
    AND ea.tag_type = 'attempt'
    AND EXISTS (
      SELECT 1 FROM exam_sessions es
      WHERE es.id = ea.session_id AND es.user_id = p_user_id
        AND es.status NOT IN ('abandoned', 'expired')  -- W2.5 (bug 17)
    )
  WHERE at2.rating = p_rating
  GROUP BY ae.code, ae.task_id, at2.area, ae.element_type, ae.difficulty_default, ae.description
  ORDER BY at2.area, ae.task_id, ae.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_element_scores(UUID, TEXT) FROM anon;
