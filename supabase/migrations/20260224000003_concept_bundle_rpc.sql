-- get_concept_bundle: Recursive CTE for graph-enhanced retrieval.
-- Traverses outgoing edges from an ACS element concept up to max_depth,
-- joining concept_chunk_evidence for source citations.
--
-- Input: p_element_code TEXT (e.g. 'PA.II.A.K2'), p_max_depth INT (default 2)
-- Returns: concept details + evidence chunks JSONB at each depth level.

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
    -- Anchor: find concept node for ACS element by slug
    SELECT c.id, c.name, c.category, c.content, c.key_facts,
           c.common_misconceptions,
           0 AS depth,
           NULL::text AS relation_type,
           NULL::text AS examiner_transition,
           ARRAY[c.id] AS path
    FROM concepts c
    WHERE c.slug = 'acs_element:' || p_element_code
      AND c.validation_status IN ('validated', 'pending')

    UNION ALL

    -- Traverse outgoing edges
    SELECT nc.id, nc.name, nc.category, nc.content, nc.key_facts,
           nc.common_misconceptions,
           g.depth + 1,
           cr.relation_type,
           cr.examiner_transition,
           g.path || nc.id
    FROM graph g
    JOIN concept_relations cr ON g.id = cr.source_id
    JOIN concepts nc ON cr.target_id = nc.id
    WHERE g.depth < p_max_depth
      AND nc.id != ALL(g.path)  -- prevent cycles
      AND nc.validation_status IN ('validated', 'pending')
  )
  SELECT g.id AS concept_id,
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
  ORDER BY g.depth, g.category;
$$;

-- Also add an incoming edge traversal variant for reverse lookups
-- (e.g., finding what elements a regulatory claim applies to)
CREATE OR REPLACE FUNCTION get_concept_bundle_reverse(
  p_concept_slug TEXT,
  p_max_depth INT DEFAULT 2
) RETURNS TABLE (
  concept_id UUID,
  concept_name TEXT,
  concept_category TEXT,
  concept_content TEXT,
  key_facts JSONB,
  depth INT,
  relation_type TEXT
) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE graph AS (
    SELECT c.id, c.name, c.category, c.content, c.key_facts,
           0 AS depth, NULL::text AS relation_type, ARRAY[c.id] AS path
    FROM concepts c
    WHERE c.slug = p_concept_slug
      AND c.validation_status IN ('validated', 'pending')

    UNION ALL

    SELECT nc.id, nc.name, nc.category, nc.content, nc.key_facts,
           g.depth + 1, cr.relation_type, g.path || nc.id
    FROM graph g
    JOIN concept_relations cr ON g.id = cr.target_id
    JOIN concepts nc ON cr.source_id = nc.id
    WHERE g.depth < p_max_depth
      AND nc.id != ALL(g.path)
      AND nc.validation_status IN ('validated', 'pending')
  )
  SELECT g.id, g.name, g.category, g.content, g.key_facts, g.depth, g.relation_type
  FROM graph g
  ORDER BY g.depth, g.category;
$$;
