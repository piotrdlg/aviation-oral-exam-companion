-- Fix get_concept_bundle to match acs_element, acs_task, and acs_area slugs.
-- Previously only matched 'acs_element:' || code, so searching for tasks/areas returned nothing.

CREATE OR REPLACE FUNCTION get_concept_bundle(
  p_element_code TEXT,
  p_max_depth INT DEFAULT 2
) RETURNS TABLE (
  concept_id UUID,
  concept_name TEXT,
  concept_category TEXT,
  concept_content TEXT,
  key_facts JSONB,
  common_misconceptions JSONB,
  depth INT,
  relation_type TEXT,
  examiner_transition TEXT,
  evidence_chunks JSONB
) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE graph AS (
    -- Anchor: find concept node by slug, trying all ACS category prefixes
    SELECT c.id, c.name, c.category, c.content, c.key_facts,
           c.common_misconceptions,
           0 AS depth,
           NULL::text AS relation_type,
           NULL::text AS examiner_transition,
           ARRAY[c.id] AS path
    FROM concepts c
    WHERE c.slug IN (
      'acs_element:' || p_element_code,
      'acs_task:' || p_element_code,
      'acs_area:' || p_element_code
    )
      AND c.validation_status IN ('validated', 'pending')

    UNION ALL

    -- Traverse both outgoing and incoming edges
    SELECT nc.id, nc.name, nc.category, nc.content, nc.key_facts,
           nc.common_misconceptions,
           g.depth + 1,
           neighbor.relation_type,
           neighbor.examiner_transition,
           g.path || nc.id
    FROM graph g
    CROSS JOIN LATERAL (
      -- Outgoing edges: this concept is the source
      SELECT cr.target_id AS neighbor_id, cr.relation_type, cr.examiner_transition
      FROM concept_relations cr
      WHERE cr.source_id = g.id

      UNION ALL

      -- Incoming edges: this concept is the target (only at depth 0 to avoid blowup)
      SELECT cr.source_id AS neighbor_id, cr.relation_type, cr.examiner_transition
      FROM concept_relations cr
      WHERE cr.target_id = g.id
        AND g.depth = 0
    ) neighbor
    JOIN concepts nc ON nc.id = neighbor.neighbor_id
    WHERE g.depth < p_max_depth
      AND nc.id != ALL(g.path)
      AND nc.validation_status IN ('validated', 'pending')
  )
  SELECT DISTINCT ON (g.id)
         g.id AS concept_id,
         g.name AS concept_name,
         g.category AS concept_category,
         g.content AS concept_content,
         g.key_facts,
         g.common_misconceptions,
         g.depth,
         g.relation_type,
         g.examiner_transition,
         (SELECT jsonb_agg(ev ORDER BY ev->>'confidence' DESC)
          FROM (
            SELECT jsonb_build_object(
              'chunk_id', sc.id,
              'content', left(sc.content, 500),
              'doc_title', sd.title,
              'page_ref', CASE WHEN sc.page_start IS NOT NULL
                          THEN 'p.' || sc.page_start
                          ELSE NULL END,
              'confidence', cce.confidence
            ) AS ev
            FROM concept_chunk_evidence cce
            JOIN source_chunks sc ON cce.chunk_id = sc.id
            JOIN source_documents sd ON sc.document_id = sd.id
            WHERE cce.concept_id = g.id
            ORDER BY cce.confidence DESC
            LIMIT 3
          ) sub
         ) AS evidence_chunks
  FROM graph g
  ORDER BY g.id, g.depth, g.category;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
